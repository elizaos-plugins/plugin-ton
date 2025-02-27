import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import { DexProvider, dexProvider } from "./providers/dex.ts";
import dexAction from "./actions/dex.ts";

export { WalletProvider, transferAction as TransferTonToken };
export { DexProvider, dexAction };

export const tonPlugin2: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",
    actions: [transferAction, ],
    evaluators: [],
    providers: [nativeWalletProvider, dexProvider],
};

export default tonPlugin2;
