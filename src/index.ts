import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import createWalletAction from "./actions/createWallet.ts";
import loadWalletAction from "./actions/loadWallet.ts";
import stakeAction from "./actions/stake.ts";
import unstakeAction from "./actions/unstake.ts";
import getPoolInfoAction from "./actions/getPoolInfo.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import { StakingProvider, nativeStakingProvider } from "./providers/staking.ts";

export { WalletProvider, transferAction as TransferTonToken, createWalletAction as CreateTonWallet, loadWalletAction as LoadTonWallet };
export { StakingProvider, stakeAction as StakeTonToken, unstakeAction as UnstakeTonToken, getPoolInfoAction as GetPoolInfoTonToken  };

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
    ],
    evaluators: [],
    providers: [nativeWalletProvider, nativeStakingProvider],
};

export default tonPlugin;