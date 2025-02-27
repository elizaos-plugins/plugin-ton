import { defaultCharacter } from "@elizaos/core";

import { describe, it, vi, expect, beforeAll } from "vitest";
import { Dedust } from "../providers/dexes/dedust";

import { mnemonicNew, mnemonicToPrivateKey, type KeyPair } from "@ton/crypto";
import { Address, JettonMaster } from "@ton/ton";
import { StonFi } from "../providers/dexes";
import { WalletProvider } from "../providers/wallet";

const JETTON_0_ADDRESS = "kQDLvsZol3juZyOAVG8tWsJntOxeEZWEaWCbbSjYakQpuYN5"; // TestRED
const JETTON_1_ADDRESS = "kQB_TOJSB7q3-Jm1O8s0jKFtqLElZDPjATs5uJGsujcjznq3"; // TestBLUE
const testnet = "https://testnet.toncenter.com/api/v2/jsonRPC";

// Mock the ICacheManager
const mockCacheManager = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
  delete: vi.fn(),
};

describe("DEX: Ston.fi", () => {
  let keypair: KeyPair;
  let mockedRuntime;
  let stonFiClient;

  beforeAll(async () => {
    const password = "";
    const mnemonics: string[] = await mnemonicNew(12, password);
    keypair = await mnemonicToPrivateKey(mnemonics, password);
    mockedRuntime = {
      character: defaultCharacter,
    };
    const walletProvider = new WalletProvider(
      keypair,
      testnet,
      mockCacheManager
    );
    stonFiClient = new StonFi(walletProvider);
  });


  it("should deposit Jetton to a Jetton/TON pool", async () => {
    const jetton0 = new JettonMaster(Address.parse(JETTON_0_ADDRESS));
    const result = await stonFiClient.deposit(
      [
        {
          jetton: jetton0,
          amount: 0,
        },
      ],
      1
    );
    expect(result).toEqual(true);
  });

});
