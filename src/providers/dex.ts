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
    type DEX,
    type TransactionHash,
    isPoolSupported,
    SUPPORTED_DEXES,
    SupportedMethod,
  } from "./dexes";
  import { initWalletProvider } from "./wallet";
  
  export class DexProvider implements DexProvider {
    megaDex = [];
    // activePools: ...
  
    constructor(walletProvider: WalletProvider, runtime: IAgentRuntime) {
      this.megaDex["TORCH_FINANCE"] = new TorchFinance(walletProvider);
      this.megaDex["DEDUST"] = new Dedust();
      this.megaDex["STON_FI"] = new StonFi(walletProvider);
    }
  
    getAllDexesAndSupportedMethods() {
      return Object.keys(this.megaDex).map((index) => {
        return {
          dex: index,
          supportedMethods: this.megaDex[index].supportMethods,
        };
      });
    }
  
    async createPool(params: {
      dex: (typeof SUPPORTED_DEXES)[number];
      jettonDeposits: JettonDeposit[];
      isTon: boolean;
      tonAmount: number;
    }) {
      const { isTon, tonAmount, jettonDeposits, dex } = params;
      if (!this.isOperationSupported(dex, SupportedMethod.CREATE_POOL)) {
        throw new Error(`Pool creation is not suppoted for ${dex}`);
      }
    }
  
    isOperationSupported(
      dex: (typeof SUPPORTED_DEXES)[number],
      operation: SupportedMethod
    ): boolean {
      return Boolean(this.megaDex[dex].supportMethods[operation]);
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
      const { isTon, tonAmount, jettonDeposits, dex } = params;
      if (!this.isOperationSupported(dex, SupportedMethod.DEPOSIT)) {
        throw new Error(`Deposit is not suppoted for ${dex}`);
      }
  
      elizaLogger.log("depositLiquidity called with params:", params);
      if (!isTon && tonAmount) {
        throw new Error("Wrong input");
      }
  
      if (!isPoolSupported(dex)) {
        throw new Error("DEX not supported");
      }
  
      try {
        return this.megaDex[dex.toUpperCase()].deposit(params);
      } catch (error) {
        console.log("Error depositting");
      }
    }
  
    async withdrawLiquidity(params: {
      dex: (typeof SUPPORTED_DEXES)[number];
      isTon: boolean;
      amount?: string;
      jettonWithdrawals: JettonWithdrawal[];
    }) {
      const { isTon, amount, dex } = params;
      if (!this.isOperationSupported(dex, SupportedMethod.WITHDRAW)) {
        throw new Error(`Withdrawal is not suppoted for ${dex}`);
      }
      if (!isTon && amount) {
        throw new Error("Wrong input");
      }
  
      if (!isPoolSupported(dex)) {
        throw new Error("DEX not supported");
      }
  
      try {
        return this.megaDex[dex.toUpperCase()].withdraw(params);
      } catch (error) {
        console.log("Error depositting");
      }
    }
  
    async claimFees(params: {
      dex: (typeof SUPPORTED_DEXES)[number];
      pool: string;
      feeClaimAmount: number;
    }): Promise<void> {
      const { dex } = params;
      if (!this.isOperationSupported(dex, SupportedMethod.CLAIM_FEE)) {
        throw new Error(`Fee claim is not suppoted for ${dex}`);
      }
    }
  }
  
  export const initProvider = async (
    walletProvider: WalletProvider,
    runtime: IAgentRuntime
  ): Promise<DexProvider> => {
    return new DexProvider(walletProvider, runtime);
  };
  
  export const dexProvider: Provider = {
    async get(
      runtime: IAgentRuntime,
      // eslint-disable-next-line
      _message: Memory,
      // eslint-disable-next-line
      _state?: State
    ): Promise<string | null> {
      try {
        const walletProvider = await initWalletProvider(runtime);
        const dexProvider = await initProvider(walletProvider, runtime);
        const formattedPortfolio =
          await dexProvider.getAllDexesAndSupportedMethods();
        console.log(formattedPortfolio);
        let readable = 'Available DEXes and supported methods: \n';
        formattedPortfolio.forEach(dex => {
          readable += `${dex.dex}: ${dex.supportedMethods.map(method => `${method} `)}`;
        })
        return readable;
      } catch (error) {
        console.error(`Error in  DEX provider:`, error);
        return null;
      }
    },
  };