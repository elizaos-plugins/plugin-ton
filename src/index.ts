import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import stakeAction from "./actions/stake.ts";
import unstakeAction from "./actions/unstake.ts";
import getPoolInfoAction from "./actions/getPoolInfo.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import { StakingProvider, nativeStakingProvider } from "./providers/staking.ts";

export { WalletProvider, StakingProvider, transferAction as TransferTonToken, stakeAction as StakeTonToken, unstakeAction as UnstakeTonToken, getPoolInfoAction as GetPoolInfoTonToken  };

export const tonPlugin: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",
    actions: [
        transferAction,
        stakeAction,
        unstakeAction,
        getPoolInfoAction,
    ],
    evaluators: [],
    providers: [nativeWalletProvider, nativeStakingProvider],
};

export default tonPlugin;
