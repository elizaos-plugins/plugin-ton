import { elizaLogger, settings } from "@elizaos/core";
import {
    type ActionExample,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
    type Action,
} from "@elizaos/core";
import { composeContext } from "@elizaos/core";
import { generateObjectDeprecated } from "@elizaos/core";
import { initTonConnectProvider, TonConnectProvider } from "../providers/tonConnect";

// const tonConnectInitTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

// Example response:
// \`\`\`json
// {
//     "recipient": "9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa",
//     "amount": 1.5
// }
// \`\`\`

// {{recentMessages}}

// Extract the following information about the requested SOL transfer:
// - Recipient wallet address
// - Amount of SOL to transfer
// `;

export default {
    name: "INIT_TON_CONNECT",
    similes: ["START_TON_CONNECT", "USE_TON_CONNECT", "TON_CONNECT", "CONNECT_TON_WALLET"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // Always return true for token transfers, letting the handler deal with specifics
        elizaLogger.log("Validating token transfer from user:", message.userId);
        return true;
    },
    description: "Initialize TON Connect to connect to a TON wallet.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting INIT_TON_CONNECT handler...");

        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Will be done in the provider
        // const manifestUrl = runtime.getSetting("TON_CONNECT_MANIFEST_URL") ?? null;

        // if (!manifestUrl) {
        //     elizaLogger.error("No TON_CONNECT_MANIFEST_URL specified.");
        //     if (callback) {
        //         callback({
        //             text: "This app does not support TON Connect.",
        //             content: { error: "No TON Connect support." },
        //         });
        //     }
        //     return false;
        // }
        const tonConnectProvider = await initTonConnectProvider({
            runtime: runtime,
            state: state,
            callback: callback,
        });

        const connector, connectorStatus = tonConnectProvider.connect();

        elizaLogger.log("Connected to a TON Wallet via TON Connect.")
        if (callback) {
            callback({
                text: "Successfully connected a TON wallet via TON Connect."
            })
        }

        return connectorStatus;
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to use my TON wallet via TON Connect.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Initializing TON Connect...",
                    action: "INIT_TON_CONNECT",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;