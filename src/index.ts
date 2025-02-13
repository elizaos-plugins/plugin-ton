import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import tonConnectInitAction from "./actions/tonConnectInit.ts";
import tonConnectTransferAction from "./actions/tonConnectTransfer.ts";

export { WalletProvider,
    transferAction as TransferTonToken,
    tonConnectTransferAction as TonConnectTransferTonToken,
    tonConnectInitAction as TonConnectInit,
};

export const tonPlugin: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",
    actions: [transferAction, tonConnectTransferAction],
    evaluators: [],
    providers: [nativeWalletProvider],
};

export default tonPlugin;
