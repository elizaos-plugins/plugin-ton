import {
    Address,
    beginCell,
    Cell,
    fromNano,
    MessageRelaxed,
    OpenedContract,
    toNano,
    TonClient,
    TupleReader,
} from "@ton/ton";
import { StakingPlatform } from "../interfaces/stakingPlatform.ts";
import { internal } from "@ton/ton";
import { WalletProvider } from "../../../providers/wallet.ts";
import { elizaLogger } from "@elizaos/core";

import { Treasury, Wallet, Parent, TreasuryConfig } from "./hipo/sdk/index.ts";

async function getTreasuryState(
    tonClient: TonClient,
    treasuryAddress: Address
): Promise<TreasuryConfig> {
    const treasuryInstance = Treasury;
    const treasury = tonClient.open(
        treasuryInstance.createFromAddress(treasuryAddress)
    );
    return treasury.getTreasuryState();
}

async function getHipoWallet(
    tonClient: TonClient,
    address: Address,
    treasuryAddress: Address
): Promise<OpenedContract<Wallet>> {
    const treasuryState = await getTreasuryState(tonClient, treasuryAddress);

    if (!treasuryState.parent) throw new Error("No parent in treasury state");
    const parent = tonClient.open(
        Parent.createFromAddress(treasuryState.parent)
    );

    const walletAddress = await parent.getWalletAddress(address);

    // Get wallet contract
    const hipoWalletInstance = Wallet;
    const hipoWallet = tonClient.open(
        hipoWalletInstance.createFromAddress(walletAddress)
    );

    return hipoWallet;
}

async function getExchangeRate(
    tonClient: TonClient,
    treasuryAddress: Address
): Promise<number> {
    const treasuryState = await getTreasuryState(tonClient, treasuryAddress);
    return Number(treasuryState.totalTokens) / Number(treasuryState.totalCoins);
}

function calculateJettonsToTon(jettons: bigint, rate: number): bigint {
    return !rate || !jettons
        ? BigInt(0)
        : BigInt(toNano(Number(jettons) * (1 / rate)));
}

export class HipoStrategy implements StakingPlatform {
    constructor(
        readonly tonClient: TonClient,
        readonly walletProvider: WalletProvider
    ) {}

    async getPendingWithdrawal(
        address: Address,
        poolAddress: Address
    ): Promise<bigint> {
        const hipoWallet = await getHipoWallet(
            this.tonClient,
            address,
            poolAddress
        );
        const walletState = await hipoWallet.getWalletState();

        const rate = await getExchangeRate(this.tonClient, poolAddress);
        return calculateJettonsToTon(walletState.unstaking, rate);
    }

    async getStakedTon(
        address: Address,
        poolAddress: Address
    ): Promise<bigint> {
        const hipoWallet = await getHipoWallet(
            this.tonClient,
            address,
            poolAddress
        );
        const walletState = await hipoWallet.getWalletState();

        const rate = await getExchangeRate(this.tonClient, poolAddress);
        return calculateJettonsToTon(walletState.tokens, rate);
    }

    async getPoolInfo(poolAddress: Address): Promise<any> {
        try {
            const result = await getTreasuryState(this.tonClient, poolAddress);

            return result;
        } catch (error) {
            console.error("Error fetching Hipo pool info:", error);
            throw error;
        }
    }

    async createStakeMessage(
        poolAddress: Address,
        amount: number
    ): Promise<MessageRelaxed> {
        const payload = beginCell()
            .storeUint(0x3d3761a6, 32)
            .storeUint(0n, 64)
            .storeAddress(null)
            .storeCoins(toNano(amount))
            .storeCoins(1n)
            .storeAddress(null)
            .endCell();

        const intMessage = internal({
            to: poolAddress,
            value: toNano(amount) + 100000000n,
            body: payload,
            bounce: true,
            init: null,
        });

        return intMessage;
    }

    async createUnstakeMessage(
        poolAddress: Address,
        amount: number
    ): Promise<MessageRelaxed> {
        const rate = await getExchangeRate(this.tonClient, poolAddress);

        const jettonAmount = amount * rate;

        const payload = beginCell()
            .storeUint(0x595f07bc, 32)
            .storeUint(0n, 64)
            .storeCoins(toNano(jettonAmount))
            .storeAddress(undefined)
            .storeMaybeRef(beginCell().storeUint(0, 4).storeCoins(1n))
            .endCell();

        const hipoWallet = await getHipoWallet(
            this.tonClient,
            Address.parse(this.walletProvider.getAddress()),
            poolAddress
        );

        const intMessage = internal({
            to: hipoWallet.address,
            value: 100000000n,
            body: payload,
            bounce: true,
            init: null,
        });

        return intMessage;
    }
}
