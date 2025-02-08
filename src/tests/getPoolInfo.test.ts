import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { defaultCharacter } from "@elizaos/core";
import { KeyPair, mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { IStakingProvider, StakingProvider } from "../providers/staking";
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

const testnet = "https://testnet.toncenter.com/api/v2/jsonRPC";
// Mock the ICacheManager
const mockCacheManager = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    delete: vi.fn(),
};


describe("Get Pool Info Action", () => {
    let stakingProvider: IStakingProvider;
    let walletProvider: WalletProvider;
    let keypair: KeyPair;
    let mockedRuntime;

    beforeAll(async () => {
        const password = "";
        const mnemonics: string[] = await mnemonicNew(12, password);
        keypair = await mnemonicToPrivateKey(mnemonics, password);
        walletProvider = new WalletProvider(keypair, testnet, mockCacheManager);
        stakingProvider = new StakingProvider(walletProvider);
        mockedRuntime = {
            character: defaultCharacter,
        };
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockCacheManager.get.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    it("should successfully fetch TON Whales pool info", async () => {

        const poolInfo = await stakingProvider.getPoolInfo("kQDV1LTU0sWojmDUV4HulrlYPpxLWSUjM6F3lUurMbwhales"); // very first pool
        console.log(poolInfo);
    });
});