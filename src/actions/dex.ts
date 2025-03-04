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
import { base64ToHex, sanitizeTonAddress, sleep, waitSeqnoContract } from "../utils/util";
import { z } from "zod";
import { SUPPORTED_DEXES } from "../providers/dexes";
import { DexProvider, initProvider } from "../providers/dex";
import { Address, JettonMaster } from "@ton/ton";

// Schema for DEX operations
const dexActionSchema = z.object({
  operation: z.enum(["CREATE_POOL", "DEPOSIT", "WITHDRAW", "CLAIM_FEE"]),
  dex: z.enum(SUPPORTED_DEXES as [string, ...string[]]),
  tokenA: z.string().optional(),
  amountA: z.number().optional(),
  tokenB: z.string().optional(),
  amountB: z.number().optional(),
  isTon: z.boolean().optional(),
  tonAmount: z.number().optional(),
  pool: z.string().optional(),
  liquidity: z.number().optional(),
})
.refine(data => {
  // Validate required fields based on operation
  switch (data.operation) {
    case "CREATE_POOL":
      return (data.tokenA && data.amountA && ((data.tokenB && data.amountB) || (data.isTon && data.tonAmount)));
    case "DEPOSIT":
    case "WITHDRAW":
      return ((data.tokenA && data.amountA) || (data.isTon && data.tonAmount)) && data.liquidity !== undefined;
    case "CLAIM_FEE":
      return data.pool !== undefined;
    default:
      return false;
  }
}, {
  message: "Missing required fields for operation"
});

type DexActionContent = z.infer<typeof dexActionSchema>;

const dexTemplate = `Return a JSON object for the DEX operation. The response should contain no schema information or additional properties.

Example responses:

For creating a pool:
\`\`\`json
{
    "operation": "CREATE_POOL",
    "dex": "DEDUST",
    "tokenA": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountA": 100,
    "tokenB": "EQBCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountB": 100,
    "isTon": false
}
\`\`\`

For TON-token pool creation:
\`\`\`json
{
    "operation": "CREATE_POOL",
    "dex": "DEDUST",
    "tokenA": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountA": 100,
    "isTon": true,
    "tonAmount": 50
}
\`\`\`

For depositing liquidity:
\`\`\`json
{
    "operation": "DEPOSIT",
    "dex": "DEDUST",
    "tokenA": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountA": 100,
    "isTon": true,
    "tonAmount": 50,
    "liquidity": 75
}
\`\`\`

For withdrawing liquidity:
\`\`\`json
{
    "operation": "WITHDRAW",
    "dex": "DEDUST",
    "tokenA": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amountA": 100,
    "isTon": true,
    "tonAmount": 50,
    "liquidity": 75
}
\`\`\`

For claiming fees:
\`\`\`json
{
    "operation": "CLAIM_FEE",
    "dex": "DEDUST",
    "pool": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "liquidity": 10
}
\`\`\`

Rules:
- Operation must be one of: CREATE_POOL, DEPOSIT, WITHDRAW, CLAIM_FEE
- DEX must be one of: ${SUPPORTED_DEXES.join(", ")}
- For CREATE_POOL: 
  * Requires tokenA/amountA and either tokenB/amountB or isTon/tonAmount
  * Set isTon=true for TON-token pools
- For DEPOSIT/WITHDRAW: 
  * Requires either tokenA/amountA or isTon/tonAmount
  * Requires liquidity amount
  * Set isTon=true for TON-token pools
- For CLAIM_FEE: 
  * Requires pool address
  * Requires liquidity amount for fee claiming
- All addresses must be valid TON addresses
- All amounts must be positive numbers

{{recentMessages}}

IMPORTANT: Return ONLY the operation object with no schema information or wrapper object.`;

export class DexAction {
  private walletProvider: WalletProvider;
  private dexProvider: DexProvider;

  constructor(walletProvider: WalletProvider, dexProvider: DexProvider) {
    this.walletProvider = walletProvider;
    this.dexProvider = dexProvider;
  }

  private validateAddresses(params: DexActionContent): void {
    if (params.tokenA) {
      const tokenAAddress = sanitizeTonAddress(params.tokenA);
      if (!tokenAAddress) throw new Error(`Invalid token A address: ${params.tokenA}`);
      params.tokenA = tokenAAddress;
    }

    if (params.tokenB) {
      const tokenBAddress = sanitizeTonAddress(params.tokenB);
      if (!tokenBAddress) throw new Error(`Invalid token B address: ${params.tokenB}`);
      params.tokenB = tokenBAddress;
    }

    if (params.pool) {
      const poolAddress = sanitizeTonAddress(params.pool);
      if (!poolAddress) throw new Error(`Invalid pool address: ${params.pool}`);
      params.pool = poolAddress;
    }
  }

  private async executeOperation(params: DexActionContent): Promise<string> {
    const walletClient = this.walletProvider.getWalletClient();
    const contract = walletClient.open(this.walletProvider.wallet);
    const seqno = await contract.getSeqno();
    
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

    try {
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
            feeClaimAmount: params.liquidity,
          });
          break;
      }

      await waitSeqnoContract(seqno, contract);
      const state = await walletClient.getContractState(this.walletProvider.wallet.address);
      return base64ToHex(state.lastTransaction.hash);
    } catch (error) {
      elizaLogger.error("Error executing DEX operation:", error);
      throw new Error(`DEX operation failed: ${error.message}`);
    }
  }

  async run(params: DexActionContent): Promise<string> {
    this.validateAddresses(params);
    return await this.executeOperation(params);
  }
}

const buildDexActionDetails = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State
): Promise<DexActionContent> => {
  const walletInfo = await nativeWalletProvider.get(runtime, message, state);
  state.walletInfo = walletInfo;

  let currentState = state;
  if (!currentState) {
    currentState = (await runtime.composeState(message)) as State;
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }

  const actionContext = composeContext({
    state,
    template: dexTemplate,
  });

  const content = await generateObject({
    runtime,
    context: actionContext,
    schema: dexActionSchema,
    modelClass: ModelClass.SMALL,
  });

  return content.object as DexActionContent;
};

export default {
  name: "MANAGE_LIQUIDITY_POOLS",
  similes: ["CREATE_POOL", "DEPOSIT_POOL", "WITHDRAW_POOL", "CLAIM_FEE"],
  description: "Manage liquidity pools: create new pools, deposit liquidity, withdraw liquidity and claim fees",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: any,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log("Starting DEX operation handler...");

    try {
      const dexActionDetails = await buildDexActionDetails(runtime, message, state);
      
      const walletProvider = await initWalletProvider(runtime);
      const dexProvider = await initProvider(walletProvider, runtime);
      const action = new DexAction(walletProvider, dexProvider);
      
      const hash = await action.run(dexActionDetails);

      if (callback) {
        const operationMap = {
          CREATE_POOL: "created pool",
          DEPOSIT: "deposited liquidity",
          WITHDRAW: "withdrawn liquidity",
          CLAIM_FEE: "claimed fees",
        };

        callback({
          text: `Successfully ${operationMap[dexActionDetails.operation]}. Transaction hash: ${hash}`,
          content: {
            success: true,
            hash: hash,
            operation: dexActionDetails.operation,
          },
        });
      }

      return true;
    } catch (error) {
      elizaLogger.error("Error during DEX operation:", error);
      if (callback) {
        callback({
          text: `Error performing DEX operation: ${error.message}`,
          content: { error: error.message },
        });
      }
      return false;
    }
  },
  template: dexTemplate,
  validate: async (_runtime: IAgentRuntime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Create a new liquidity pool with 100 TON and 100 USDC token (address: EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4)",
          action: "MANAGE_LIQUIDITY_POOLS",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully created pool. Transaction hash: 0x123abc...",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Deposit 50 TON and 100 USDC (EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4) into the pool with 75 liquidity units",
          action: "MANAGE_LIQUIDITY_POOLS",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully deposited liquidity. Transaction hash: 0x456def...",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Withdraw 75 liquidity units from the TON-USDC pool at EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
          action: "MANAGE_LIQUIDITY_POOLS",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully withdrawn liquidity. Transaction hash: 0x789ghi...",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Claim 10 units of fees from pool EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
          action: "MANAGE_LIQUIDITY_POOLS",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Successfully claimed fees. Transaction hash: 0x012jkl...",
        },
      },
    ],
  ],
};
