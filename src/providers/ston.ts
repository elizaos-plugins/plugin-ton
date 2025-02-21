import type {
    IAgentRuntime,
} from "@elizaos/core";

import { AssetTag, StonApiClient } from '@ston-fi/api';
import { TonClient } from "@ton/ton";

import { DEX, pTON } from "@ston-fi/sdk";
import { testnetAssets } from "../utils/testnetStonAssets";

const PROVIDER_CONFIG = {
    SWAP_WAITING_TIME: 1000, // [ms]
    SWAP_WAITING_STEPS: 180, // total waiting time = SWAP_WAITING_TIME * SWAP_WAITING_STEPS
    TX_WAITING_TIME: 1000, // [ms]
    TX_WAITING_STEPS: 60, // total waiting time = TX_WAITING_TIME * TX_WAITING_STEPS
    mainnet: {
        ROUTER_VERSION: "v1",
        ROUTER_ADDRESS: "",
        PTON_VERSION: "v1",
        PTON_ADDRESS: "",

    },
    testnet: {
        ROUTER_VERSION: "v2_1",
        ROUTER_ADDRESS: "kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v",
        PTON_VERSION: "v2_1",
        PTON_ADDRESS: "kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px",
    }

}

export interface StonAsset {
    balance?: string | undefined;
    blacklisted: boolean;
    community: boolean;
    contractAddress: string;
    decimals: number;
    defaultSymbol: boolean;
    deprecated: boolean;
    dexPriceUsd?: string | undefined;
    displayName?: string | undefined;
    imageUrl?: string | undefined;
    kind: "Ton" | "Wton" | "Jetton";
    priority: number;
    symbol: string;
    thirdPartyPriceUsd?: string | undefined;
    walletAddress?: string | undefined;
    popularityIndex?: number | undefined;
    tags: AssetTag[];
    customPayloadApiUri?: string | undefined;
    extensions?: string[] | undefined;
}

export class StonProvider {
    public client: StonApiClient;
    public NETWORK: "mainnet" | "testnet";
    public SWAP_WAITING_TIME: number;
    public SWAP_WAITING_STEPS: number;
    public TX_WAITING_TIME: number;
    public TX_WAITING_STEPS: number;
    public ROUTER_VERSION: string;
    public ROUTER_ADDRESS: string;
    public PTON_VERSION: string;
    public PTON_ADDRESS: string;

    constructor(runtime: IAgentRuntime) {
        this.client = runtime.getSetting("STON_API_BASE_URL") ? new StonApiClient({ baseURL: runtime.getSetting("STON_API_BASE_URL") }) : new StonApiClient();
        // if not given, it uses mainnet
        this.NETWORK = runtime.getSetting("TON_RPC_URL")?.includes("testnet") ? "testnet" : "mainnet";
        this.SWAP_WAITING_TIME = Number(runtime.getSetting("SWAP_WAITING_TIME") ?? PROVIDER_CONFIG.SWAP_WAITING_TIME);
        this.SWAP_WAITING_STEPS = Number(runtime.getSetting("SWAP_WAITING_STEPS") ?? PROVIDER_CONFIG.SWAP_WAITING_STEPS);
        this.TX_WAITING_TIME = Number(runtime.getSetting("TX_WAITING_TIME") ?? PROVIDER_CONFIG.TX_WAITING_TIME);
        this.TX_WAITING_STEPS = Number(runtime.getSetting("TX_WAITING_STEPS") ?? PROVIDER_CONFIG.TX_WAITING_STEPS);
        this.ROUTER_VERSION = runtime.getSetting("ROUTER_VERSION") ?? PROVIDER_CONFIG[this.NETWORK].ROUTER_VERSION;
        this.ROUTER_ADDRESS = runtime.getSetting("ROUTER_ADDRESS") ?? PROVIDER_CONFIG[this.NETWORK].ROUTER_ADDRESS;
        this.PTON_VERSION = runtime.getSetting("PTON_VERSION") ?? PROVIDER_CONFIG[this.NETWORK].PTON_VERSION;
        this.PTON_ADDRESS = runtime.getSetting("PTON_ADDRESS") ?? PROVIDER_CONFIG[this.NETWORK].PTON_ADDRESS;
    }

    async getAsset(symbol: string, condition: string = `${AssetTag.DefaultSymbol}`) {
        if (this.NETWORK === "mainnet") {
            return this.getAssetMainnet(symbol, condition);
        } else {
            return this.getAssetTestnet(symbol);
        }
    }
    async getAssets(from: string, to: string, condition: string = `${AssetTag.DefaultSymbol}`) {
        if (this.NETWORK === "mainnet") {
            return this.getAssetsMainnet(from, to, condition);
        } else {
            return this.getAssetsTestnet(from, to);
        }
    }

    async getAssetMainnet(symbol: string, condition: string = `${AssetTag.DefaultSymbol}`) {

        // search assets across of all DEX assets based on search string and query condition
        const matchedInAssets = await this.client.searchAssets({
            searchString: symbol,
            condition,
            limit: 1,
        });
        if (matchedInAssets.length === 0) {
            throw new Error(`Asset ${symbol} not supported`);
        }

        const asset = await this.client.getAsset(matchedInAssets[0].contractAddress);


        if (asset.deprecated) {
            throw new Error(`Asset ${asset.symbol} is deprecated`);
        }

        if (asset.blacklisted) {
            throw new Error(`Asset ${asset.symbol} is blacklisted`);
        }

        return asset;
    }


    async getAssetsMainnet(from: string, to: string, condition: string = `${AssetTag.DefaultSymbol}`) {

        const inAsset = await this.getAssetMainnet(from, condition);
        const outAsset = await this.getAssetMainnet(to, condition);

        const pairs = await this.client.getSwapPairs();
        if (!pairs.find((pair) => pair.includes(inAsset.contractAddress) && pair.includes(outAsset.contractAddress))) {
            throw new Error(`Swap pair ${inAsset.symbol} to ${outAsset.symbol} is not supported`);
        }

        return [inAsset, outAsset];
    }

    async getAssetTestnet(symbol: string) {
        const asset = testnetAssets.find((asset) => asset.symbol === symbol);

        if (!asset) {
            throw new Error(`Asset ${symbol} not supported`);
        }

        return asset as StonAsset;
    }


    async getAssetsTestnet(from: string, to: string) {
        const inAsset = this.getAssetTestnet(from);
        const outAsset = this.getAssetTestnet(to);

        return [inAsset, outAsset];
    }

    getRouterAndProxy(client: TonClient) {
        let router, proxyTON;
        if (this.ROUTER_VERSION === "v1") {
            router = client.open(new DEX[this.ROUTER_VERSION].Router());
        } else {
            router = client.open(DEX[this.ROUTER_VERSION].Router.create(this.ROUTER_ADDRESS));
        }
        if (this.PTON_VERSION === "v1") {
            proxyTON = new pTON[this.PTON_VERSION]();
        } else {
            proxyTON = pTON[this.PTON_VERSION].create(this.PTON_ADDRESS);
        }
        return [router, proxyTON];
    }
}


export async function initStonProvider(runtime: IAgentRuntime): Promise<StonProvider> {
    return new StonProvider(runtime);
};


