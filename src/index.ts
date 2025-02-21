import type { Action, Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import createWalletAction from "./actions/createWallet.ts";
import loadWalletAction from "./actions/loadWallet.ts";
import auctionAction from "./actions/auctionInteraction.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";

export { WalletProvider, transferAction as TransferTonToken, createWalletAction as CreateTonWallet, loadWalletAction as LoadTonWallet, batchTransferAction as BatchTransferTokens };
export { auctionAction as AuctionInteractionActionTon };

export const tonPlugin: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",
    actions: [
        transferAction,
        createWalletAction,
        loadWalletAction,
        auctionAction as Action,
    ],
    evaluators: [],
    providers: [nativeWalletProvider],
};

export default tonPlugin;