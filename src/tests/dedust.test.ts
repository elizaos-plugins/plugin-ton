import { defaultCharacter } from "@elizaos/core";

import { describe, it, vi, expect, beforeAll } from "vitest";
import { Dedust } from "../providers/dexes/dedust";

import { mnemonicNew, mnemonicToPrivateKey, type KeyPair } from "@ton/crypto";
import { Address, JettonMaster } from "@ton/ton";

const SCALE_ADDR = "EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE";

describe("DEX: DeDust", () => {
  let keypair: KeyPair;
  let mockedRuntime;
  let dedustClient;

  beforeAll(async () => {
    const password = "";
    const mnemonics: string[] = await mnemonicNew(12, password);
    keypair = await mnemonicToPrivateKey(mnemonics, password);
    mockedRuntime = {
      character: defaultCharacter,
    };
    dedustClient = new Dedust();
    await dedustClient.init(mockedRuntime);
  });

  describe("Create Pool", () => {
    it("should get pool", async () => {
      const scale = new JettonMaster(Address.parse(SCALE_ADDR));
      const usdt = new JettonMaster(
        Address.parse("EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs")
      );
      const aqua = new JettonMaster(
        Address.parse("EQAWDyxARSl3ol2G1RMLMwepr3v6Ter5ls3jiAlheKshgg0K")
      );
      const not = new JettonMaster(
        Address.parse("EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT")
      );
      let result = await dedustClient.getPool([scale]);
      expect(result.address.toString()).toEqual(
        "EQDcm06RlreuMurm-yik9WbL6kI617B77OrSRF_ZjoCYFuny"
      );
      result = await dedustClient.getPool([scale, not]);
      expect(result.address.toString()).toEqual(
        "EQDJN4L57W_05RrcUhnShICi0j02aCkFnhQugK0zQf0LL5WC"
      );
      result = await dedustClient.getPool([aqua, usdt]);
      expect(result.address.toString()).toEqual(
        "EQCm2vzJvYS2vtfp-jsPZTp-8AIRWMRHHYA2YmiQ54Hixp7W"
      );
    });

    // NOTE DeDust factory only deployed on mainnet, skipping tests for now
    // Reference: https://docs.dedust.io/docs/getting-started & https://github.com/dedust-io/sdk/issues/4
    it.skip("should create pool", async () => {
      const build = new JettonMaster(
        Address.parse("EQBYnUrIlwBrWqp_rl-VxeSBvTR2VmTfC4ManQ657n_BUILD")
      );
      const pavul = new JettonMaster(
        Address.parse("EQChXgdfER2nuLvZP5EiSlCf95oXZ5KDiCEmGBBv_WcNdxz3")
      );
      const result = await dedustClient.createPool([build, pavul]);
      expect(result).toEqual(true);
    });
  });
});
