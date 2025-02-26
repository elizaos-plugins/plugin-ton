import type { Action, Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import createWalletAction from "./actions/createWallet.ts";
import loadWalletAction from "./actions/loadWallet.ts";
import stakeAction from "./actions/stake.ts";
import unstakeAction from "./actions/unstake.ts";
import getPoolInfoAction from "./actions/getPoolInfo.ts";
import batchTransferAction from "./actions/batchTransfer.ts";
import auctionAction from "./actions/auctionInteraction.ts";
import createListingAction from "./actions/createListing.ts";
import buyListingAction from "./actions/buyListing.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import tokenPriceAction from "./actions/tokenPrice.ts";
import { tonTokenPriceProvider } from "./providers/tokenProvider.ts";

export { tokenPriceAction as GetTokenPrice };
import { StakingProvider, nativeStakingProvider } from "./providers/staking.ts";
import { create } from "handlebars";

export {
  WalletProvider,
  transferAction as TransferTonToken,
  createWalletAction as CreateTonWallet,
  loadWalletAction as LoadTonWallet,
};
export {
  StakingProvider,
  stakeAction as StakeTonToken,
  unstakeAction as UnstakeTonToken,
  getPoolInfoAction as GetPoolInfoTonToken,
};
import { tonConnectProvider } from "./providers/tonConnect.ts";
import {
  connectAction,
  disconnectAction,
  showConnectionStatusAction,
} from "./actions/tonConnect.ts";
import tonConnectTransactionAction from "./actions/tonConnectTransaction.ts";
export { batchTransferAction as BatchTransferTokens };
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
    batchTransferAction,
    connectAction,
    disconnectAction,
    showConnectionStatusAction,
    tonConnectTransactionAction,
    tokenPriceAction,
    auctionAction as Action,
    createListingAction as Action,
    buyListingAction as Action,
  ],
  evaluators: [],
  providers: [nativeWalletProvider, nativeStakingProvider, tonConnectProvider,tonTokenPriceProvider],
};

export default tonPlugin;
