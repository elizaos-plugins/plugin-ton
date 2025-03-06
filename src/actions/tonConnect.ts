import {
    Action,
    elizaLogger,
    GoalStatus,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
  } from "@elizaos/core";

  import {
    initTonConnectProvider,
    tonConnectProvider as connectStatusProvider,
  } from "../providers/tonConnect";
  import QRCode from "qrcode";
  import { toUserFriendlyAddress } from "@tonconnect/sdk";
  interface ActionOptions {
    [key: string]: unknown;
  }

  async function getOrCreateTonConnectGoal(
    runtime: IAgentRuntime,
    message: Memory
  ) {
    const existingGoals = await runtime.databaseAdapter.getGoals({
      agentId: runtime.agentId,
      roomId: message.roomId,
      userId: message.userId,
      onlyInProgress: true,
    });

    const existingGoal = existingGoals.find(
      (g) => g.name === "TON_CONNECT_WALLET"
    );
    if (existingGoal) {
      return existingGoal;
    }

    const newGoal = await runtime.databaseAdapter.createGoal({
      roomId: message.roomId,
      userId: message.userId,
      name: "TON_CONNECT_WALLET",
      status: GoalStatus.IN_PROGRESS,
      objectives: [
        {
          id: "init_connection",
          description: "Initialize TON wallet connection",
          completed: false,
        },
        {
          id: "wait_user_approval",
          description: "Wait for user to approve connection",
          completed: false,
        },
        {
          id: "verify_connection",
          description: "Verify wallet connection and get details",
          completed: false,
        },
      ],
    });

    return newGoal;
  }

  export const connectAction: Action = {
    name: "TON_CONNECT",
    similes: [
      "TON_CONNECT",
      "USE_TON_CONNECT",
      "CONNECT_TON_WALLET",
      "TON_CONNECT_WALLET",
    ],
    description: "connect to ton wallet with tonconnect",
    validate: async (runtime: IAgentRuntime, message: Memory) => {

      // exit if TONCONNECT is not used
      if (!runtime.getSetting('TON_MANIFEST_URL')) {
          return false
      }

      // Validation logic
      const existingGoals = await runtime.databaseAdapter.getGoals({
        agentId: runtime.agentId,
        roomId: message.roomId,
        userId: message.userId,
        onlyInProgress: true,
      });

      const tonConnectGoal = existingGoals.find(
        (g) => g.name === "TON_CONNECT_WALLET"
      );

      if (tonConnectGoal) {
        return ["FAILED", "COMPLETED"].includes(tonConnectGoal.status);
      }
      const tonConnectProvider = await initTonConnectProvider(runtime);
      return !!tonConnectProvider;
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      _options: ActionOptions,
      callback?: HandlerCallback
    ) => {

      // exit if TONCONNECT is not used
      if (!runtime.getSetting('TON_MANIFEST_URL')) {
          return false
      }

      // Implementation
      // Initialize or update state
      if (!state) {
        state = (await runtime.composeState(message)) as State;
      } else {
        state = await runtime.updateRecentMessageState(state);
      }
      elizaLogger.log("Starting TON_CONNECT handler...");

      const connectorStatus = await connectStatusProvider.get(
        runtime,
        message,
        state
      );

      if (!connectorStatus) {
        callback?.({
          text: "Error connecting to TON wallet. Please try again later.",
        });
        return true;
      }

      state.connectorStatus = connectorStatus;

      const { status, walletInfo } = connectorStatus;

      const tonConnectProvider = await initTonConnectProvider(runtime);

      if (status === "Connected" && walletInfo) {
        callback?.({
          text:
            `Current wallet status: Connected\n` +
            `Address: ${toUserFriendlyAddress(walletInfo.account.address)}\n` +
            `Raw Address: ${walletInfo.account.address}\n` +
            `Chain: ${walletInfo.account.chain}\n` +
            `Platform: ${walletInfo.device.platform}\n` +
            `App: ${walletInfo.device.appName || "Unknown"}`,
        });
        return true;
      }

      if (status === "Disconnected" && tonConnectProvider) {
        const unified = await tonConnectProvider.connect();
        const qrCodeData = await QRCode.toDataURL(unified);
        callback?.({
          text: `Please connect your TON wallet using this link:\n${unified}`,
          attachments: [
            {
              id: crypto.randomUUID(),
              url: qrCodeData,
              title: "TON Wallet Connect QR Code",
              source: "tonConnect",
              description: "Scan this QR code with your TON wallet",
              contentType: "image/png",
              text: "Scan this QR code with your TON wallet",
            },
          ],
        });

        return true;
      }

      if (status === "Connecting") {
        callback?.({
          text: "Connecting to TON wallet...",
        });
        return true;
      }

      return true;
    },
    examples: [
      // Example 1: Initial connection request
      [
        {
          user: "{{user1}}",
          content: {
            text: "Connect my TON wallet",
            action: "TON_CONNECT",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Please connect your TON wallet using this link:\nhttps://app.tonkeeper.com/connect/example-universal-link",
          },
        },
      ],
      // Example 2: Successful connection
      [
        {
          user: "{{user1}}",
          content: {
            text: "Check my TON wallet connection",
            action: "TON_CONNECT",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Connected to TON wallet:\nAddress: EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4\nChain: mainnet\nPlatform: web",
          },
        },
      ],
      // Example 3: Connection in progress
      [
        {
          user: "{{user1}}",
          content: {
            text: "Link TON wallet",
            action: "TON_CONNECT",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Connecting to TON wallet...",
          },
        },
      ],
      // Example 4: Error case
      [
        {
          user: "{{user1}}",
          content: {
            text: "Connect wallet",
            action: "TON_CONNECT",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Error connecting to TON wallet. Please try again later.",
          },
        },
      ],
    ],
  };

  export const disconnectAction: Action = {
    name: "TON_DISCONNECT",
    similes: [
      "TON_DISCONNECT",
      "DISCONNECT_TON_WALLET",
      "DISCONNECT_WALLET",
      "LOGOUT_TON_WALLET",
    ],
    description: "disconnect from connected ton wallet",
    validate: async (runtime: IAgentRuntime, message: Memory) => {

      // exit if TONCONNECT is not used
      if (!runtime.getSetting('TON_MANIFEST_URL')) {
          return false
      }

      const tonConnectProvider = await initTonConnectProvider(runtime);
      if (!tonConnectProvider) return false;

      return tonConnectProvider.isConnected();
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      _options: ActionOptions,
      callback?: HandlerCallback
    ) => {

      // exit if TONCONNECT is not used
      if (!runtime.getSetting('TON_MANIFEST_URL')) {
          return false
      }

      if (!state) {
        state = (await runtime.composeState(message)) as State;
      } else {
        state = await runtime.updateRecentMessageState(state);
      }
      elizaLogger.log("Starting TON_DISCONNECT handler...");

      const tonConnectProvider = await initTonConnectProvider(runtime);
      if (!tonConnectProvider) {
        callback?.({
          text: "Error disconnecting from TON wallet. Wallet provider not initialized.",
        });
        return true;
      }

      try {
        await tonConnectProvider.disconnect();
        callback?.({
          text: "Successfully disconnected from TON wallet.",
        });
      } catch (error) {
        callback?.({
          text: "Error disconnecting from TON wallet. Please try again later.",
        });
      }

      return true;
    },
    examples: [
      // Example 1: Successful disconnection
      [
        {
          user: "{{user1}}",
          content: {
            text: "Disconnect my TON wallet",
            action: "TON_DISCONNECT",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Successfully disconnected from TON wallet.",
          },
        },
      ],
      // Example 2: Error case
      [
        {
          user: "{{user1}}",
          content: {
            text: "Disconnect wallet",
            action: "TON_DISCONNECT",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Error disconnecting from TON wallet. Please try again later.",
          },
        },
      ],
    ],
  };

  export const showConnectionStatusAction: Action = {
    name: "TON_CONNECTION_STATUS",
    similes: [
      "TON_STATUS",
      "WALLET_STATUS",
      "CHECK_TON_CONNECTION",
      "SHOW_WALLET_STATUS",
    ],
    description: "show current TON wallet connection status",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {

      // exit if TONCONNECT is not used
      if (!runtime.getSetting('TON_MANIFEST_URL')) {
          return false
      }

      const tonConnectProvider = await initTonConnectProvider(runtime);
      return !!tonConnectProvider;
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      _options: ActionOptions,
      callback?: HandlerCallback
    ) => {
      if (!state) {
        state = (await runtime.composeState(message)) as State;
      } else {
        state = await runtime.updateRecentMessageState(state);
      }
      elizaLogger.log("Starting TON_CONNECTION_STATUS handler...");

      const connectorStatus = await connectStatusProvider.get(
        runtime,
        message,
        state
      );

      if (!connectorStatus) {
        callback?.({
          text: "Unable to fetch wallet connection status.",
        });
        return true;
      }

      const { status, walletInfo } = connectorStatus;

      switch (status) {
        case "Connected":
          if (walletInfo) {
            callback?.({
              text:
                `Current wallet status: Connected\n` +
                `Address: ${toUserFriendlyAddress(
                  walletInfo.account.address
                )}\n` +
                `Raw Address: ${walletInfo.account.address}\n` +
                `Chain: ${walletInfo.account.chain}\n` +
                `Platform: ${walletInfo.device.platform}\n` +
                `App: ${walletInfo.device.appName || "Unknown"}`,
            });
          }
          break;
        case "Connecting":
          callback?.({
            text: "Wallet status: Connection in progress...",
          });
          break;
        case "Disconnected":
          callback?.({
            text: "Wallet status: Not connected\nUse TON_CONNECT to connect your wallet.",
          });
          break;
        default:
          callback?.({
            text: `Wallet status: ${status}`,
          });
      }

      return true;
    },
    examples: [
      // Example 1: Connected wallet status
      [
        {
          user: "{{user1}}",
          content: {
            text: "Show my wallet status",
            action: "TON_CONNECTION_STATUS",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text:
              "Current wallet status: Connected\n" +
              "Address: EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4\n" +
              "Chain: mainnet\n" +
              "Platform: web\n" +
              "App: Tonkeeper",
          },
        },
      ],
      // Example 2: Disconnected status
      [
        {
          user: "{{user1}}",
          content: {
            text: "Check wallet connection",
            action: "TON_CONNECTION_STATUS",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Wallet status: Not connected\nUse TON_CONNECT to connect your wallet.",
          },
        },
      ],
      // Example 3: Connecting status
      [
        {
          user: "{{user1}}",
          content: {
            text: "What's my wallet status",
            action: "TON_CONNECTION_STATUS",
          },
        },
        {
          user: "{{user2}}",
          content: {
            text: "Wallet status: Connection in progress...",
          },
        },
      ],
    ],
  };
