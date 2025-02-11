import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import tonConnectWalletProvider from "./providers/tonConnect.ts";
import {tonConnect} from "./actions/tonConnect.ts";
import {showConnected} from "./actions/showConnected.ts";
import {disconnect} from "./actions/disconnect.ts";

export { WalletProvider, transferAction as TransferTonToken };

export const tonPlugin: Plugin = {
    name: "ton",
    description: "Ton Plugin for Eliza",
    actions: [transferAction, tonConnect, showConnected, disconnect],
    evaluators: [],
    providers: [nativeWalletProvider, tonConnectWalletProvider],
};

export default tonPlugin;
