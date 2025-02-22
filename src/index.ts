import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import createWalletAction from "./actions/createWallet.ts";
import loadWalletAction from "./actions/loadWallet.ts";
import stakeAction from "./actions/stake.ts";
import unstakeAction from "./actions/unstake.ts";
import getPoolInfoAction from "./actions/getPoolInfo.ts";
import batchTransferAction from "./actions/batchTransfer.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import tokenPriceAction from "./actions/tokenPrice.ts";
import { tonTokenPriceProvider } from "./providers/tokenProvider.ts";

export { WalletProvider, transferAction as TransferTonToken };
export { tokenPriceAction as GetTokenPrice };
import { StakingProvider, nativeStakingProvider } from "./providers/staking.ts";

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
    tokenPriceAction
  ],
  evaluators: [],
  providers: [nativeWalletProvider, nativeStakingProvider, tonConnectProvider,tonTokenPriceProvider],
};

export default tonPlugin;
