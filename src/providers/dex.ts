import { IAgentRuntime, elizaLogger } from "@elizaos/core";
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
  Tonco,
  SupportedMethod,
} from "./dexes";

export class DexProvider implements DexProvider {
  megaDex: [(typeof SUPPORTED_DEXES)[number], DEX];
  // activePools: ...

  constructor(walletProvider: WalletProvider, runtime: IAgentRuntime) {
    this.megaDex["TORCH_FINANCE"] = new TorchFinance(walletProvider, runtime);
    this.megaDex["DEDUST"] = new Dedust();
    this.megaDex["STON_FI"] = new StonFi(walletProvider);
    this.megaDex["TONCO"] = new Tonco();
  }

  getAllDexesAndSupportedMethods() {
    return this.megaDex.map((dex, index) => {
      return {
        dex,
        supportedMethods: (dex as DEX).supportMethods
      }
    })
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
    tonAmount?: string;
    jettonWithdrawals: JettonWithdrawal[];
  }) {
    const { isTon, tonAmount, dex } = params;
    if (!this.isOperationSupported(dex, SupportedMethod.WITHDRAW)) {
      throw new Error(`Withdrawal is not suppoted for ${dex}`);
    }
    if (!isTon && tonAmount) {
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
    jettonAddress: string;
    feeClaimAmount: string;
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
