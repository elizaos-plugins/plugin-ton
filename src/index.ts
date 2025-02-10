import type { Plugin } from "@elizaos/core";
import transferAction from "./actions/transfer.ts";
import { WalletProvider, nativeWalletProvider } from "./providers/wallet.ts";
import tokenPriceAction from "./actions/tokenPrice.ts";
import { tonTokenPriceProvider } from "./providers/tokenProvider.ts";

export { WalletProvider, transferAction as TransferTonToken };
export { tokenPriceAction as GetTokenPrice };

export const tonPlugin: Plugin = {
  name: "ton",
  description: "Ton Plugin for Eliza",
  actions: [transferAction, tokenPriceAction],
  evaluators: [],
  providers: [nativeWalletProvider, tonTokenPriceProvider],
};

export default tonPlugin;
