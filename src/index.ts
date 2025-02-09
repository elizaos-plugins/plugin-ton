import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import tonConnectTransactionAction from "./actions/tonConnectTransaction.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import {
  connectAction,
  disconnectAction,
  showConnectionStatusAction,
} from "./actions/tonConnect.ts";
import { tonConnectProvider } from "./providers/tonConnect.ts";
export { WalletProvider, transferAction as TransferTonToken };

export const tonPlugin: Plugin = {
  name: "ton",
  description: "Ton Plugin for Eliza",
  actions: [
    transferAction,
    connectAction,
    disconnectAction,
    showConnectionStatusAction,
    tonConnectTransactionAction,
  ],
  evaluators: [],
  providers: [nativeWalletProvider, tonConnectProvider],
};

export default tonPlugin;
