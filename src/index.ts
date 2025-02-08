import type { Action, Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import auctionAction from "./actions/auctionInteraction.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";

export { WalletProvider, transferAction as TransferTonToken, auctionAction as AuctionInteractionActionTon };

export const tonPlugin: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",

    actions: [transferAction, auctionAction as Action],
    evaluators: [],
    providers: [nativeWalletProvider],
};

export default tonPlugin;
