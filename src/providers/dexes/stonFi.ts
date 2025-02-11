import { TonClient } from "@ton/ton";
import { JettonDeposit, DEX, Token, JettonWithdrawal } from "./dex";
import { DEX as StonFiDEX } from "@ston-fi/sdk";

const client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
});

const router = client.open(
    StonFiDEX.v2_1.Router.create(
        "kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v" // CPI Router v2.1.0
    )
);

export class StonFi implements DEX {
    wallet: any;

    constructor(wallet) {
        this.wallet = wallet;
    }
    createPool: () => {};
    deposit: (params: {
        jettonDeposits: JettonDeposit[];
        isTon: boolean;
        tonAmount: number;
    }) => {};
    withdraw: (params: {
        jettonWithdrawals: JettonWithdrawal[];
        isTon: boolean;
        amount: number;
    }) => {};
    async claimFee() {
        const vault = client.open(
            await router.getVault({
                tokenMinter: "kQDLvsZol3juZyOAVG8tWsJntOxeEZWEaWCbbSjYakQpuYN5", // TestRED
                user: this.wallet.address, // ! replace with your address
            })
        );

        const txParams = await vault.getWithdrawFeeTxParams({
            queryId: 12345,
        });
    }
}
