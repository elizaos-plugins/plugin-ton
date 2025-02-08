import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import batchTransferAction from "./actions/batchTransfer.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";

export { WalletProvider, transferAction as TransferTonToken, batchTransferAction as BatchTransferTokens };

export const tonPlugin: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",
    actions: [transferAction, batchTransferAction],
    evaluators: [],
    providers: [nativeWalletProvider],
};

export default tonPlugin;
