import { describe, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { AuctionInteractionAction } from "../actions/auctionInteraction";
import { defaultCharacter } from "@elizaos/core";
import { type KeyPair, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletProvider } from "../providers/wallet";


// Mock NodeCache
vi.mock("node-cache", () => {
  return {
      default: vi.fn().mockImplementation(() => ({
          set: vi.fn(),
          get: vi.fn().mockReturnValue(null),
      })),
  };
});

// Mock path module
vi.mock("path", async () => {
  const actual = await vi.importActual("path");
  return {
      ...actual,
      join: vi.fn().mockImplementation((...args) => args.join("/")),
  };
});

// Mock the ICacheManager
export const mockCacheManager = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  delete: vi.fn(),
};

export const testnet = "https://testnet.toncenter.com/api/v2/jsonRPC";

const NFT_AUCTION_CONTRACT_ADDRESS = "kQC_fD_gbAgXsuizLU-5usV4sIuRhotmM3DYIUSkBpFYXwAR";

describe("Auction Interaction Action", () => {
    let auctionAction: AuctionInteractionAction;
    let walletProvider: WalletProvider;
    let keypair: KeyPair;
    let mockedRuntime;

    beforeAll(async () => {
        const password = "";
        const privateKey = process.env.TON_PRIVATE_KEY;
        if (!privateKey) {
            throw new Error(`TON_PRIVATE_KEY is missing`);
        }
    
        const mnemonics = privateKey.split(" ");
        if (mnemonics.length < 2) {
            throw new Error(`TON_PRIVATE_KEY mnemonic seems invalid`);
        }
        keypair = await mnemonicToPrivateKey(mnemonics, password);

        walletProvider = new WalletProvider(keypair, testnet, mockCacheManager);
        mockedRuntime = {
            character: defaultCharacter,
        };
        auctionAction = new AuctionInteractionAction(walletProvider);
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockCacheManager.get.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.clearAllTimers();
    });


  it("should log result for getSaleData", async () => {
    try {
      const result = await auctionAction.getAuctionData(NFT_AUCTION_CONTRACT_ADDRESS);
      console.log("Direct getSaleData result:", result);
    } catch (error: any) {
      console.log("Direct getSaleData error:", error.message);
    }
  });

  it("should log result for bid", async () => {
    try {
      const result = await auctionAction.bid(
        NFT_AUCTION_CONTRACT_ADDRESS,
        "2"
      );
      console.log("Direct bid result:", result);
    } catch (error: any) {
      console.log("Direct bid error:", error);
    }
  });

  it("should log result for stop", async () => {
    try {
      const result = await auctionAction.stop(NFT_AUCTION_CONTRACT_ADDRESS);
      console.log("Direct stop result:", result);
    } catch (error: any) {
      console.log("Direct stop error:", error);
    }
  });

  it("should log result for cancel", async () => {
    try {
      const result = await auctionAction.cancel(NFT_AUCTION_CONTRACT_ADDRESS);
      console.log("Direct cancel result:", result);
    } catch (error: any) {
      console.log("Direct cancel error:", error.message);
    }
  });
}); 