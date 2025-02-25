import { defaultCharacter } from "@elizaos/core";

import {
  describe,
  it,
  vi,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import BigNumber from "bignumber.js";
import { WalletProvider } from "../providers/wallet";

import { mnemonicNew, mnemonicToPrivateKey, type KeyPair } from "@ton/crypto";
import { DexProvider } from "../providers/dex";
import { DEX, SUPPORTED_DEXES } from "../providers/dexes";

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
const mockCacheManager = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  delete: vi.fn(),
};

const testnet = "https://testnet.toncenter.com/api/v2/jsonRPC";

describe("DEX Provider", () => {
  let dexProvider: DexProvider;
  let keypair: KeyPair;
  let mockedRuntime;

  beforeAll(async () => {
    const password = "";
    const mnemonics: string[] = await mnemonicNew(12, password);
    keypair = await mnemonicToPrivateKey(mnemonics, password);
    const walletProvider = new WalletProvider(
      keypair,
      testnet,
      mockCacheManager
    );
    mockedRuntime = {
      character: defaultCharacter,
    };
    dexProvider = new DexProvider(walletProvider, mockedRuntime);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("DEX Integration", () => {
    it("should get all dexes and supported methods", async () => {
      const result = await dexProvider.getAllDexesAndSupportedMethods();

      expect(result.length).to.eq(SUPPORTED_DEXES.length);
    });
  });
});
