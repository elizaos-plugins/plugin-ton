// pool creation, liquidity provisioning, and management

import {
  composeContext,
  Content,
  elizaLogger,
  generateObject,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelClass,
  State,
} from "@elizaos/core";
import {
  initWalletProvider,
  nativeWalletProvider,
  WalletProvider,
} from "../providers/wallet";
import { base64ToHex, sleep } from "../utils/util";
import { z } from "zod";
import { SUPPORTED_DEXES } from "../providers/dexes";
import { DexProvider, initProvider } from "../providers/dex";
import { Address, JettonMaster } from "@ton/ton";

interface ActionOptions {
  [key: string]: unknown;
}

// create new liquidity pools
// handle deposits/withdrawals
//  and manage fees

// TODO
const template = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example responses:
\`\`\`json
{
    "tokenA": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountA": 1,
    "tokenB": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountB": 1,
    "dex": "DEDUST",
    "operation": "CREATE_POOL",
}
\`\`\`

\`\`\`json
{
    "tokenA": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountA": 1,
    "isTon": true,
    "toneAmount": 1,
    "liquidity": "1",
    "dex": "DEDUST",
    "operation": "DEPOSIT",
}
\`\`\`



{{recentMessages}}

Given the recent messages, extract the following information about the requested token transfer:
- The operation the user would like to perform from the following list: CREATE_POOL, DEPOSIT, WITHDRAW, CLAIM_FEE
- The dex with which they want to work with, pick from the following list: DEDUST, STON_FI, TORCH_FINANCE
- The address of the first token of the liquidity pool
- The amount of the first token of the liquidity pool they want to deposit or withdraw
- The address of the second token of the liquidity pool
- The amount of the second token of the liquidity pool they want to deposit or withdraw
- A flag if one of the tokens is TON
- The amount of TON if one of the tokens is TON
- The address of the liquidty pool they want to work with
- In case of DEPOSIT or WITHDRAW operations, the amount of liquidity they want to withdraw or deposit

Respond with a JSON markdown block containing only the extracted values.`;

interface ActionContent extends Content {
  operation: "CREATE_POOL" | "DEPOSIT" | "WITHDRAW" | "CLAIM_FEE";
  dex: (typeof SUPPORTED_DEXES)[number];
  pool?: string;
  tokenA: string;
  amountA: number;
  tokenB: string;
  amountB: number;
  isTon: boolean;
  tonAmount: number;
  amount?: number;
}

export class Action {
  private walletProvider: WalletProvider;
  dexProvider: DexProvider;

  constructor(walletProvider: WalletProvider, dexProvider: DexProvider) {
    this.walletProvider = walletProvider;
    this.dexProvider = dexProvider;
  }

  async run(params: ActionContent): Promise<string> {
    const walletClient = this.walletProvider.getWalletClient();
    const contract = walletClient.open(this.walletProvider.wallet);
    const jettonDeposits = [];
    if (params.tokenA) {
      jettonDeposits.push({
        jetton: new JettonMaster(Address.parse(params.tokenA)),
        amount: params.amountA,
      });
    }
    if (params.tokenB) {
      jettonDeposits.push({
        jetton: new JettonMaster(Address.parse(params.tokenB)),
        amount: params.amountB,
      });
    }

    switch (params.operation) {
      case "CREATE_POOL":
        await this.dexProvider.createPool({
          dex: params.dex,
          jettonDeposits,
          isTon: params.isTon,
          tonAmount: params.tonAmount,
        });
        break;
      case "DEPOSIT":
        await this.dexProvider.depositLiquidity({
          dex: params.dex,
          jettonDeposits,
          isTon: params.isTon,
          tonAmount: params.tonAmount,
        });
        break;

      case "WITHDRAW":
        await this.dexProvider.withdrawLiquidity({
          dex: params.dex,
          jettonWithdrawals: jettonDeposits,
          isTon: params.isTon,
        });
        break;

      case "CLAIM_FEE":
        await this.dexProvider.claimFees({
          dex: params.dex,
          pool: params.pool,
          feeClaimAmount: params.amount,
        });
        break;

      default:
        break;
    }
    try {
      //this.waitForTransaction(seqno, contract);
      const state = await walletClient.getContractState(
        this.walletProvider.wallet.address
      );
      const { lt: _, hash: lastHash } = state.lastTransaction;
      return base64ToHex(lastHash);
    } catch (error) {
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }
}

const buildPoolCreationDetails = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State
): Promise<ActionContent> => {
  const walletInfo = await nativeWalletProvider.get(runtime, message, state);
  state.walletInfo = walletInfo;

  // Initialize or update state
  let currentState = state;
  if (!currentState) {
    currentState = (await runtime.composeState(message)) as State;
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }

  // Define the schema for the expected output
  const poolCreationSchema = z.object({
    tokenA: z.string(),
    tokenB: z.string(),
    initialLiquidity: z.union([z.string(), z.number()]),
  });

  // Compose transfer context
  const actionContext = composeContext({
    state,
    template: template,
  });

  // Generate transfer content with the schema
  const content = await generateObject({
    runtime,
    context: actionContext,
    schema: poolCreationSchema,
    modelClass: ModelClass.SMALL,
  });

  let actionContent: ActionContent = content.object as ActionContent;

  if (actionContent === undefined) {
    actionContent = content as unknown as ActionContent;
  }

  return actionContent;
};

function isPoolCreationContent(content: Content): content is ActionContent {
  console.log("Content for pool creation", content);
  return (
    typeof content.tokenA === "string" &&
    typeof content.tokenB === "string" &&
    typeof content.initialLiuqidity === "number"
  );
}

export default {
  name: "MANAGE_LIQUIDITY_POOLS",
  similes: ["CREATE_POOL", "DEPOSIT_POOL", "WITHDRAW_POOL", "CLAIM_FEE"],
  description:
    "Manage liquidity pools: create new pools, deposit liquidity, withdraw liquidity and claim fees",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: ActionOptions,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log("Starting SEND_TOKEN handler...");

    const poolCreationDetails = await buildPoolCreationDetails(
      runtime,
      message,
      state
    );

    // Validate transfer content
    if (!isPoolCreationContent(poolCreationDetails)) {
      console.error("Invalid content for TRANSFER_TOKEN action.");
      if (callback) {
        callback({
          text: "Unable to process transfer request. Invalid content provided.",
          content: { error: "Invalid transfer content" },
        });
      }
      return false;
    }

    try {
      // TODO check token balance before transfer
      const walletProvider = await initWalletProvider(runtime);
      const dexProvider = await initProvider(walletProvider, runtime);
      const action = new Action(walletProvider, dexProvider);
      const hash = await action.run(poolCreationDetails);

      if (callback) {
        callback({
          // TODO wait for transaction to complete
          text: `Successfully created pool ${poolCreationDetails.address}, Transaction: ${hash}`,
          content: {
            success: true,
            hash: hash,
          },
        });
      }

      return true;
    } catch (error) {
      console.error("Error during token transfer:", error);
      if (callback) {
        callback({
          text: `Error transferring tokens: ${error.message}`,
          content: { error: error.message },
        });
      }
      return false;
    }
  },
  template,
  // eslint-disable-next-line
  validate: async (_runtime: IAgentRuntime) => true,
  examples: [],
};
