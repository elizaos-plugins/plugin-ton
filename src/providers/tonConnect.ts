import type {IAgentRuntime, ICacheManager} from "@elizaos/core";
import TonConnect, {ITonConnect} from "@tonconnect/sdk";
import {IStorage, Storg} from "../utils/storage.ts";

export class TonConnectWalletProvider {
    private readonly cacheManager: ICacheManager;
    private readonly runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.cacheManager = runtime.cacheManager;
    }

    /**
     * Get connected via TON Connect wallet provider
     * @param address - If not provided use first from connected list
     */
    async getWalletClient(address: string = null): Promise<ITonConnect> {
        const storage: IStorage = new Storg(this.cacheManager)
        const connected: { [key: string]: string } = await storage.getCachedAddressList()
        let selected: string = Object.keys(connected)?.[0] ?? null;
        if (address && connected?.[address]) {
            selected = address
        }

        if (!selected) {
            throw new Error('No wallets connected')
        }

        await storage.readFromCache(selected)

        const manifestUrl = this.runtime.getSetting("TON_CONNECT_MANIFEST_URL") ?? process.env.TON_CONNECT_MANIFEST_URL ?? null
        if (!manifestUrl) {
            throw new Error(`Unable to proceed. Please provide a TON_CONNECT_MANIFEST_URL'`);
        }

        const connector = new TonConnect({manifestUrl, storage});
        await connector.restoreConnection()

        if (connector.connected) {
            return connector
        }

        throw new Error('No wallets connected')
    }
}

export default TonConnectWalletProvider;
