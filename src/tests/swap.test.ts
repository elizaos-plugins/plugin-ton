import { describe, it, expect, vi, beforeAll } from "vitest";
import { IAgentRuntime } from "@elizaos/core";

import { initStonProvider, StonAsset, StonProvider } from "../providers/ston";
import { type KeyPair, mnemonicToWalletKey } from "@ton/crypto";
import { WalletProvider } from "../providers/wallet";
import { SwapAction } from "../actions/swapSton";
import { AssetTag } from '@ston-fi/api';

const TON_RPC_URL = "https://testnet.toncenter.com/api/v2/jsonRPC";
const SWAP = ["TON", "TestRED", "0.001"] // Sucessfull Swap
const SWAP_2 = ["TON", "TestRED", "1000.0"] // Insufficient Balance
const TON_PRIVATE_KEY = ""


// Mock the ICacheManager
const mockCacheManager = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    delete: vi.fn(),
};

describe("Swap Asset Action", () => {
    let stonProvider: StonProvider;
    let walletProvider: WalletProvider;
    let keypair: KeyPair;
    let mockedRuntime: IAgentRuntime;

    beforeAll(async () => {
        mockedRuntime = {
            getSetting: vi.fn().mockImplementation((key) => {
                if (key === "TON_RPC_URL") return TON_RPC_URL;
                return undefined;
            }),
        } as unknown as IAgentRuntime;
        keypair = await mnemonicToWalletKey(TON_PRIVATE_KEY.split(" "));
        walletProvider = new WalletProvider(keypair, TON_RPC_URL, mockCacheManager);
        stonProvider = await initStonProvider(mockedRuntime);
    });

    it("should successfully swap TON asset to TestRED in Testnet", async () => {
        const [inTokenAsset, outTokenAsset] = await stonProvider.getAssets(
            SWAP[0],
            SWAP[1],
            `(${AssetTag.LiquidityVeryHigh} | ${AssetTag.LiquidityHigh} | ${AssetTag.LiquidityMedium} ) & ${AssetTag.Popular} & ${AssetTag.DefaultSymbol}`
        ) as [StonAsset, StonAsset];
        const action = new SwapAction(walletProvider, stonProvider);
        await action.swap(inTokenAsset, outTokenAsset, SWAP[2]);
    });

    it("should fail to swap TON asset to TestRED in Testnet due to insufficient balance", async () => {
        const [inTokenAsset, outTokenAsset] = await stonProvider.getAssets(
            SWAP[0],
            SWAP[1],
            `(${AssetTag.LiquidityVeryHigh} | ${AssetTag.LiquidityHigh} | ${AssetTag.LiquidityMedium} ) & ${AssetTag.Popular} & ${AssetTag.DefaultSymbol}`
        ) as [StonAsset, StonAsset];
        const action = new SwapAction(walletProvider, stonProvider);
        await expect(action.swap(inTokenAsset, outTokenAsset, SWAP_2[2])).rejects.toThrow("No funds");
    });
});
