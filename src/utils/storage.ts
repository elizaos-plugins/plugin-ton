import path from "path";
import {ICacheManager} from "@elizaos/core";

export interface IStorage {
    setItem(key: string, value: string): Promise<void>;

    getItem(key: string): Promise<string | null>;

    removeItem(key: string): Promise<void>;

    readFromCache(address: string): Promise<any>;

    writeToCache(address: string, wallet: string): Promise<void>;

    deleteFromCache(address: string): Promise<void>;

    getCachedAddressList(): Promise<{ [key: string]: string }>;
}

/**
 * Cache and storage manipulating. Partially required for @tonconnect/sdk
 */
export class Storg implements IStorage {
    private storeData: any = {}
    private cacheManager: ICacheManager
    private cacheKey = "ton/connect";
    private listKey = path.join(this.cacheKey, 'list');

    constructor(cacheManager: ICacheManager) {
        this.cacheManager = cacheManager;
    }

    public setItem(key: string, value: string): Promise<void> {
        this.storeData[key] = value;
        return Promise.resolve();
    }

    public getItem(key: string): Promise<string | null> {
        const value = this.storeData[key];
        return Promise.resolve(value);
    }

    public removeItem(key: string): Promise<void> {
        delete this.storeData[key];
        return Promise.resolve();
    }

    /**
     * Used to load and utilize the selected connection.
     * @param address
     */
    public async readFromCache(address: string): Promise<any> {
        const data: string = await this.cacheManager.get(
            path.join(this.cacheKey, address),
        ) ?? '{}';
        return JSON.parse(data);
    }

    /**
     * Save connected wallet to re-use
     * @param address
     * @param wallet
     */
    public async writeToCache(address: string, wallet: string): Promise<void> {
        await this.cacheManager.set(path.join(this.cacheKey, address), JSON.stringify({data: this.storeData, wallet}));

        let list: { [x: string]: string; }
        try {
            list = JSON.parse(await this.cacheManager.get(this.listKey) ?? '{}');
        } catch (error) {
            list = {}
        }

        if (!list?.[address]) {
            list[address] = wallet;
        }

        await this.cacheManager.set(this.listKey, JSON.stringify(list));
    }

    /**
     * To delete connection from list after disconnect
     * @param address
     */
    public async deleteFromCache(address: string): Promise<void> {
        await this.cacheManager.delete(path.join(this.cacheKey, address));

        let list = JSON.parse(await this.cacheManager.get(this.listKey) ?? '{}');
        delete list[address];
        await this.cacheManager.set(this.listKey, JSON.stringify(list));
    }

    /**
     * Get all connected wallets by its address
     */
    public async getCachedAddressList(): Promise<{ [key: string]: string }> {
        const list = JSON.parse(await this.cacheManager.get(this.listKey) ?? '{}')
        return list ?? {}
    }
}
