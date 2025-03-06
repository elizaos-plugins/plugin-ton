import { describe, it, expect, vi, beforeAll } from "vitest";
import type { IAgentRuntime } from "@elizaos/core";
import { initStonProvider, type StonProvider } from "../providers/ston";

//const TON_RPC_URL = "https://testnet.toncenter.com/api/v2/jsonRPC";
const TON_RPC_URL = "https://toncenter.com/api/v2/jsonRPC";

describe("Query Ston Asset Action", () => {
    let stonProvider: StonProvider;
    let mockedRuntime: IAgentRuntime;

    beforeAll(async () => {
        mockedRuntime = {
            getSetting: vi.fn().mockImplementation((key) => {
                if (key == "TON_RPC_URL") return TON_RPC_URL;
                return undefined;
            }),
        } as unknown as IAgentRuntime;
        stonProvider = await initStonProvider(mockedRuntime);
    });

    it("should successfully query TON asset and return asset information", async () => {
        const asset = await stonProvider.getAsset("TON");
        expect(asset.kind).toBe("Ton");
    });

    it("should fail to query a non existent asset", async () => {
        await expect(stonProvider.getAsset("NonExistentAsset")).rejects.toThrow("Asset NonExistentAsset not supported");
    });
});
