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
import { DexProvider } from "../providers/dex";
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
    elizaLogger.debug("DexAction initialized with wallet and DEX providers");
  }

  private async executeOperation(params: DexActionContent): Promise<string> {
    elizaLogger.debug(`Executing DEX operation: ${params.operation} on ${params.dex}`, {
      isTon: params.isTon,
      tonAmount: params.tonAmount,
      tokenA: params.tokenA,
      amountA: params.amountA,
      tokenB: params.tokenB,
      amountB: params.amountB,
      liquidity: params.liquidity
    });

    const walletClient = this.walletProvider.getWalletClient();
    const contract = walletClient.open(this.walletProvider.wallet);
    const seqno = await contract.getSeqno();
    elizaLogger.debug(`Current wallet seqno: ${seqno}`);
    
    const jettonDeposits = [];
    if (params.tokenA) {
      elizaLogger.debug(`Adding token A to jetton deposits: ${params.tokenA}, amount: ${params.amountA}`);
      
      try {
        const tokenAddress = Address.parse(params.tokenA);
        elizaLogger.debug(`Token A address parsed successfully: ${tokenAddress.toString()}`);
        
        jettonDeposits.push({
          jetton: new JettonMaster(tokenAddress),
          amount: params.amountA,
        });
        elizaLogger.debug(`Token A added to deposits with amount: ${params.amountA}`);
      } catch (error) {
        elizaLogger.error(`Error parsing token A address: ${error.message}`);
        throw new Error(`Invalid token A address: ${params.tokenA}. Error: ${error.message}`);
      }
    }
    
    if (params.tokenB) {
      elizaLogger.debug(`Adding token B to jetton deposits: ${params.tokenB}, amount: ${params.amountB}`);
      
      try {
        const tokenAddress = Address.parse(params.tokenB);
        elizaLogger.debug(`Token B address parsed successfully: ${tokenAddress.toString()}`);
        
        jettonDeposits.push({
          jetton: new JettonMaster(tokenAddress),
          amount: params.amountB,
        });
        elizaLogger.debug(`Token B added to deposits with amount: ${params.amountB}`);
      } catch (error) {
        elizaLogger.error(`Error parsing token B address: ${error.message}`);
        throw new Error(`Invalid token B address: ${params.tokenB}. Error: ${error.message}`);
      }
    }

    elizaLogger.debug(`Final jetton deposits configuration:`, 
      jettonDeposits.map((jd, idx) => ({
        index: idx,
        address: jd.jetton.address.toString(),
        amount: jd.amount,
        workchain: jd.jetton.address.workChain,
        hashPart: jd.jetton.address.hash.toString('hex').substring(0, 10) + '...'
      }))
    );

    try {
      switch (params.operation) {
        case "CREATE_POOL":
          elizaLogger.debug("Creating pool with parameters:", {
            dex: params.dex,
            jettonDeposits: jettonDeposits.map(jd => ({
              jetton: jd.jetton.address.toString(),
              amount: jd.amount
            })),
            isTon: params.isTon,
            tonAmount: params.tonAmount
          });
          
          elizaLogger.debug(`Calling DEX provider createPool method for ${params.dex}`);
          const createPoolResult = await this.dexProvider.createPool({
            dex: params.dex,
            jettonDeposits,
            isTon: params.isTon,
            tonAmount: params.tonAmount,
          });
          elizaLogger.debug(`Pool creation request sent successfully, result:`, createPoolResult);
          break;

        case "DEPOSIT":
          elizaLogger.debug("Depositing liquidity with parameters:", {
            dex: params.dex,
            jettonDeposits: jettonDeposits.map(jd => ({
              jetton: jd.jetton.address.toString(),
              amount: jd.amount
            })),
            isTon: params.isTon,
            tonAmount: params.tonAmount
          });
          
          elizaLogger.debug(`Calling DEX provider depositLiquidity method for ${params.dex}`);
          const depositResult = await this.dexProvider.depositLiquidity({
            dex: params.dex,
            jettonDeposits,
            isTon: params.isTon,
            tonAmount: params.tonAmount,
          });
          elizaLogger.debug(`Liquidity deposit request sent successfully, result:`, depositResult);
          break;

        case "WITHDRAW":
          elizaLogger.debug("Withdrawing liquidity with parameters:", {
            dex: params.dex,
            jettonWithdrawals: jettonDeposits.map(jd => ({
              jetton: jd.jetton.address.toString(),
              amount: jd.amount
            })),
            isTon: params.isTon,
            amount: params.liquidity
          });
          
          elizaLogger.debug(`Calling DEX provider withdrawLiquidity method for ${params.dex}`);
          const withdrawResult = await this.dexProvider.withdrawLiquidity({
            dex: params.dex,
            jettonWithdrawals: jettonDeposits,
            isTon: params.isTon,
            amount: params.liquidity?.toString()
          });
          elizaLogger.debug(`Liquidity withdrawal request sent successfully, result:`, withdrawResult);
          break;

        case "CLAIM_FEE":
          elizaLogger.debug("Claiming fees with parameters:", {
            dex: params.dex,
            pool: params.pool,
            feeClaimAmount: params.liquidity
          });
          
          elizaLogger.debug(`Calling DEX provider claimFees method for ${params.dex}`);
          const claimResult = await this.dexProvider.claimFees({
            dex: params.dex,
            pool: params.pool,
            feeClaimAmount: params.liquidity,
          });
          elizaLogger.debug(`Fee claim request sent successfully, result:`, claimResult);
          break;
      }

      elizaLogger.debug(`Waiting for transaction confirmation (seqno: ${seqno})...`);
      await waitSeqnoContract(seqno, contract);
      elizaLogger.debug("Transaction confirmed successfully");
      
      const state = await walletClient.getContractState(this.walletProvider.wallet.address);
      const txHash = base64ToHex(state.lastTransaction.hash);
      elizaLogger.debug(`Transaction hash: ${txHash}`);
      
      return txHash;
    } catch (error) {
      elizaLogger.error("Error executing DEX operation:", error);
      elizaLogger.error("Operation details:", {
        operation: params.operation,
        dex: params.dex,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        isTon: params.isTon
      });
      
      // Enhanced error logging
      if (error.message && error.message.includes("exit_code:")) {
        const exitCodeMatch = error.message.match(/exit_code: (-?\d+)/);
        const exitCode = exitCodeMatch ? exitCodeMatch[1] : "unknown";
        elizaLogger.error(`DEX operation failed with exit code: ${exitCode}`);
        
        if (exitCode === "-13") {
          elizaLogger.error("Exit code -13 typically indicates insufficient balance, non-existent pool, or incorrect parameters");
        }
      }
      
      if (error.stack) {
        elizaLogger.error("Error stack trace:", error.stack);
      }
      
      throw new Error(`DEX operation failed: ${error.message}`);
    }
  }

  async run(params: DexActionContent): Promise<string> {
    elizaLogger.debug(`Starting DEX operation: ${params.operation} on ${params.dex}`);
    
    // Check if the operation is supported by the selected DEX
    const supportedMethods = this.dexProvider.getAllDexesAndSupportedMethods()
      .find(dex => dex.dex === params.dex.toUpperCase())?.supportedMethods || [];
    
    elizaLogger.debug(`DEX ${params.dex} supported methods:`, supportedMethods);
    
    if (!supportedMethods.includes(params.operation)) {
      const error = `Operation ${params.operation} is not supported by ${params.dex}`;
      elizaLogger.error(error);
      throw new Error(error);
    }
    
    const result = await this.executeOperation(params);
    elizaLogger.debug(`DEX operation completed successfully with hash: ${result}`);
    return result;
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
    elizaLogger.debug("Starting DEX operation handler...");

    try {
      elizaLogger.debug("Building DEX action details from user input...");
      const dexActionDetails = await buildDexActionDetails(runtime, message, state);
      elizaLogger.debug("DEX action details extracted:", dexActionDetails);
      
      elizaLogger.debug("Initializing wallet provider...");
      const walletProvider = await initWalletProvider(runtime);
      elizaLogger.debug(`Wallet initialized with address: ${walletProvider.wallet.address.toString()}`);
      
      elizaLogger.debug("Initializing DEX provider...");
      const dexProvider = new DexProvider(walletProvider);
      elizaLogger.debug("Available DEXes:", dexProvider.getAllDexesAndSupportedMethods());
      
      elizaLogger.debug("Creating DEX action instance...");
      const action = new DexAction(walletProvider, dexProvider);
      
      elizaLogger.debug(`Executing DEX operation: ${dexActionDetails.operation} on ${dexActionDetails.dex}...`);
      const hash = await action.run(dexActionDetails);
      elizaLogger.debug(`DEX operation completed with hash: ${hash}`);

      if (callback) {
        const operationMap = {
          CREATE_POOL: "created pool",
          DEPOSIT: "deposited liquidity",
          WITHDRAW: "withdrawn liquidity",
          CLAIM_FEE: "claimed fees",
        };

        const responseText = `Successfully ${operationMap[dexActionDetails.operation]}. Transaction hash: ${hash}`;
        elizaLogger.debug(`Sending response to user: ${responseText}`);
        
        callback({
          text: responseText,
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
