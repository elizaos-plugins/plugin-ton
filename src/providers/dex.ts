import {
    IAgentRuntime,
    Provider,
    Memory,
    State,
    elizaLogger,
  } from "@elizaos/core";
  import { WalletProvider } from "..";
  import {
    Dedust,
    TorchFinance,
    StonFi,
    type JettonDeposit,
    type JettonWithdrawal,
    type TransactionHash,
    isPoolSupported,
    SUPPORTED_DEXES,
    SupportedMethod,
  } from "./dexes";
  
  export class DexProvider implements DexProvider {
    megaDex = {};
    // activePools: ...
  
    constructor(walletProvider: WalletProvider, network: 'mainnet' | 'testnet' = 'testnet') {
      elizaLogger.log(`DexProvider: Initializing with wallet provider on ${network} network`);
      
      try {
        elizaLogger.log(`DexProvider: Creating TorchFinance instance on ${network} network`);
        this.megaDex["TORCH_FINANCE"] = new TorchFinance(walletProvider, network);
        
        elizaLogger.log("DexProvider: Creating Dedust instance");
        this.megaDex["DEDUST"] = new Dedust(walletProvider);
        
        elizaLogger.log("DexProvider: Creating StonFi instance");
        this.megaDex["STON_FI"] = new StonFi(walletProvider);
        
        elizaLogger.log("DexProvider: All DEX instances created successfully");
      } catch (error) {
        elizaLogger.error("DexProvider: Error initializing DEX providers:", error);
        throw error;
      }
    }
  
    getAllDexesAndSupportedMethods() {
      elizaLogger.log("DexProvider: Getting all DEXes and supported methods");
      const result = Object.keys(this.megaDex).map((index) => {
        return {
          dex: index,
          supportedMethods: this.megaDex[index].supportMethods,
        };
      });
      elizaLogger.log(`DexProvider: Found ${result.length} DEXes`);
      return result;
    }
  
    async createPool(params: {
      dex: (typeof SUPPORTED_DEXES)[number];
      jettonDeposits: JettonDeposit[];
      isTon: boolean;
      tonAmount: number;
    }) {
      const { isTon, tonAmount, jettonDeposits, dex } = params;
      elizaLogger.log(`DexProvider: Creating pool on ${dex}`, {
        isTon,
        tonAmount,
        jettonDepositsCount: jettonDeposits.length
      });
      
      if (!this.isOperationSupported(dex, SupportedMethod.CREATE_POOL)) {
        const error = `Pool creation is not supported for ${dex}`;
        elizaLogger.error(`DexProvider: ${error}`);
        throw new Error(error);
      }
      
      try {
        const result = await this.megaDex[dex.toUpperCase()].createPool(
          jettonDeposits.map(jd => jd.jetton),
          isTon,
          tonAmount
        );
        elizaLogger.log(`DexProvider: Pool creation result: ${result}`);
        return result;
      } catch (error) {
        elizaLogger.error(`DexProvider: Error creating pool on ${dex}:`, error);
        throw error;
      }
    }
  
    isOperationSupported(
      dex: (typeof SUPPORTED_DEXES)[number],
      operation: SupportedMethod
    ): boolean {
      const dexInstance = this.megaDex[dex.toUpperCase()];
      if (!dexInstance) {
        elizaLogger.error(`DexProvider: DEX ${dex} not found`);
        return false;
      }
      
      const supported = dexInstance.supportMethods.includes(operation);
      elizaLogger.log(`DexProvider: Operation ${operation} on ${dex} supported: ${supported}`);
      return supported;
    }
  
    /**
     *
     * @summary Deposit TON and Jettons to a liquidity pool
     * @param jettonDeposits An array of JettonDeposit to deposit w/ length 0-2
     * @param isTon
     * @param tonAmount
     */
    async depositLiquidity(params: {
      dex: (typeof SUPPORTED_DEXES)[number];
      jettonDeposits: JettonDeposit[];
      isTon: boolean;
      tonAmount: number;
    }): Promise<TransactionHash> {
      const { isTon, tonAmount, dex } = params;
      elizaLogger.log(`DexProvider: Depositing liquidity on ${dex}`, {
        isTon,
        tonAmount,
        jettonDepositsCount: params.jettonDeposits.length
      });
      
      if (!this.isOperationSupported(dex, SupportedMethod.DEPOSIT)) {
        const error = `Deposit is not supported for ${dex}`;
        elizaLogger.error(`DexProvider: ${error}`);
        throw new Error(error);
      }
  
      if (!isPoolSupported(dex)) {
        const error = "DEX not supported";
        elizaLogger.error(`DexProvider: ${error}`);
        throw new Error(error);
      }
  
      try {
        // Enhanced logging for deposit parameters
        elizaLogger.log(`DexProvider: Detailed deposit parameters for ${dex}:`, {
          dex: dex,
          isTon: isTon,
          tonAmount: tonAmount,
          jettonDeposits: params.jettonDeposits.map((jd, idx) => ({
            index: idx,
            address: jd.jetton.address.toString(),
            amount: jd.amount,
            workchain: jd.jetton.address.workChain,
            hashPart: jd.jetton.address.hash.toString('hex').substring(0, 10) + '...'
          }))
        });
        
        elizaLogger.log(`DexProvider: Calling deposit method on ${dex.toUpperCase()} DEX instance`);
        const result = await this.megaDex[dex.toUpperCase()].deposit(
          params.jettonDeposits,
          tonAmount
        );
        elizaLogger.log(`DexProvider: Deposit result: ${result}`);
        return result;
      } catch (error) {
        elizaLogger.error(`DexProvider: Error depositing on ${dex}:`, error);
        
        // Enhanced error logging
        if (error.message) {
          elizaLogger.error(`DexProvider: Error message: ${error.message}`);
          
          if (error.message.includes("exit_code:")) {
            const exitCodeMatch = error.message.match(/exit_code: (-?\d+)/);
            const exitCode = exitCodeMatch ? exitCodeMatch[1] : "unknown";
            elizaLogger.error(`DexProvider: Contract execution error with exit_code: ${exitCode}`);
            
            if (exitCode === "-13") {
              elizaLogger.error("DexProvider: Exit code -13 typically indicates insufficient balance, non-existent pool, or incorrect parameters");
              elizaLogger.error("DexProvider: Checking if tokens exist in the pool...");
              
              // Log additional diagnostic information
              const dexInstance = this.megaDex[dex.toUpperCase()];
              if (dexInstance) {
                elizaLogger.log(`DexProvider: DEX instance type: ${dexInstance.constructor.name}`);
              }
            }
          }
        }
        
        if (error.stack) {
          elizaLogger.error(`DexProvider: Error stack trace: ${error.stack}`);
        }
        
        throw error;
      }
    }
  
    async withdrawLiquidity(params: {
      dex: (typeof SUPPORTED_DEXES)[number];
      isTon: boolean;
      amount?: string;
      jettonWithdrawals: JettonWithdrawal[];
    }) {
      const { isTon, amount, dex } = params;
      elizaLogger.log(`DexProvider: Withdrawing liquidity from ${dex}`, {
        isTon,
        amount,
        jettonWithdrawalsCount: params.jettonWithdrawals.length
      });
      
      if (!this.isOperationSupported(dex, SupportedMethod.WITHDRAW)) {
        const error = `Withdrawal is not supported for ${dex}`;
        elizaLogger.error(`DexProvider: ${error}`);
        throw new Error(error);
      }
      
      if (!isTon && amount) {
        const error = "Wrong input";
        elizaLogger.error(`DexProvider: ${error}`);
        throw new Error(error);
      }
  
      if (!isPoolSupported(dex)) {
        const error = "DEX not supported";
        elizaLogger.error(`DexProvider: ${error}`);
        throw new Error(error);
      }
  
      try {
        const result = await this.megaDex[dex.toUpperCase()].withdraw(
          params.jettonWithdrawals,
          isTon,
          amount ? parseFloat(amount) : undefined
        );
        elizaLogger.log(`DexProvider: Withdraw result: ${result}`);
        return result;
      } catch (error) {
        elizaLogger.error(`DexProvider: Error withdrawing from ${dex}:`, error);
        throw error;
      }
    }
  
    async claimFees(params: {
      dex: (typeof SUPPORTED_DEXES)[number];
      pool: string;
      feeClaimAmount: number;
    }): Promise<void> {
      const { dex, pool, feeClaimAmount } = params;
      elizaLogger.log(`DexProvider: Claiming fees from ${dex}`, {
        pool,
        feeClaimAmount
      });
      
      if (!this.isOperationSupported(dex, SupportedMethod.CLAIM_FEE)) {
        const error = `Fee claim is not supported for ${dex}`;
        elizaLogger.error(`DexProvider: ${error}`);
        throw new Error(error);
      }
      
      try {
        const result = await this.megaDex[dex.toUpperCase()].claimFee(params);
        elizaLogger.log(`DexProvider: Fee claim result: ${result}`);
        return result;
      } catch (error) {
        elizaLogger.error(`DexProvider: Error claiming fees from ${dex}:`, error);
        throw error;
      }
    }
  }

export const initProvider = async (
  walletProvider: WalletProvider,
  runtime: IAgentRuntime,
  network: 'mainnet' | 'testnet' = 'testnet'
): Promise<DexProvider> => {
  elizaLogger.log(`DexProvider: Initializing provider on ${network} network`);
  return new DexProvider(walletProvider, network);
};