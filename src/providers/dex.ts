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
} from "./dexes";

export class DexProvider implements DexProvider {
    megaDex: [(typeof SUPPORTED_DEXES)[number], DEX];

    constructor(walletProvider: WalletProvider, runtime: IAgentRuntime) {
        this.megaDex["TORCH_FINANCE"] = new TorchFinance(
            walletProvider,
            runtime
        );
        this.megaDex["DEDUST"] = new Dedust();
        // this.megaDex["RAINBOW_SWAP"] = new RainbowSwap();
        this.megaDex["STON_FI"] = new StonFi(walletProvider);
        // this.megaDex["ION_FINANCE"] = new IonFinance();
        // this.megaDex["MEGATON_FINANCE"] = new MegatonFinance();
        // this.megaDex["STORM"] = new Storm();
        // this.megaDex["TRADOOR_IO"] = new TradoorIo();
        // this.megaDex["TON_HEDGE"] = new TonHedge();
        // this.megaDex["TONCO"] = new Tonco();
    }

    async createPool(): Promise<string> {
        return "hash";
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
        elizaLogger.log("depositLiquidity called with params:", params);

        const { isTon, tonAmount, jettonDeposits, dex } = params;
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
        jettonAddress: string;
        feeClaimAmount: string;
    }): Promise<void> {}
}

export const initProvider = async (
    walletProvider: WalletProvider,
    runtime: IAgentRuntime
): Promise<DexProvider> => {
    return new DexProvider(walletProvider, runtime);
};
