import type { Action, Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import createWalletAction from "./actions/createWallet.ts";
import loadWalletAction from "./actions/loadWallet.ts";
import stakeAction from "./actions/stake.ts";
import unstakeAction from "./actions/unstake.ts";
import getPoolInfoAction from "./actions/getPoolInfo.ts";
import auctionAction from "./actions/auctionInteraction.ts";
import createListingAction from "./actions/createListing.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import { StakingProvider, nativeStakingProvider } from "./providers/staking.ts";
import { create } from "handlebars";

export { StakingProvider, stakeAction as StakeTonToken, unstakeAction as UnstakeTonToken, getPoolInfoAction as GetPoolInfoTonToken  };
export { WalletProvider, transferAction as TransferTonToken, createWalletAction as CreateTonWallet, loadWalletAction as LoadTonWallet};
export { auctionAction as AuctionInteractionActionTon };

export const tonPlugin: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",
    actions: [
        transferAction,
        createWalletAction,
        loadWalletAction,
        stakeAction,
        unstakeAction,
        getPoolInfoAction,
        auctionAction as Action,
        createListingAction as Action,
    ],
    evaluators: [],
    providers: [nativeWalletProvider, nativeStakingProvider],
};

export default tonPlugin;