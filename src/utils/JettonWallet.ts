import { Address, beginCell, Cell, Contract,toNano, internal } from "@ton/ton";
import { WalletProvider } from "../providers/wallet";
import { waitSeqnoContract } from "./util";

export const OP_CODES = {
    TRANSFER: 0x0f8a7ea5,
    BURN: 0x595f07bc,
} as const;

export class JettonWallet implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new JettonWallet(address);
    }

    /**
     * Helper method to send a transaction and wait for it to complete
     * @param walletProvider The wallet provider
     * @param to Destination address
     * @param value Amount of TON to send
     * @param body Message body
     */
    private async sendTransaction(
      walletProvider: WalletProvider,
      to: Address,
      value: string | bigint,
      body: Cell
    ) {
      const provider = walletProvider.getWalletClient();
      const contract = provider.open(walletProvider.wallet);
      const seqno = await contract.getSeqno();
      
      await contract.sendTransfer({
        seqno: seqno,
        secretKey: walletProvider.keypair.secretKey,
        messages: [
          internal({
            value,
            to,
            body,
          }),
        ],
      });
      
      await waitSeqnoContract(seqno, contract);
    }

    static transferMessage(
        to: Address,
        amount: bigint,
        responseAddress: Address | null = null,
        forwardAmount: bigint = 0n,
        forwardPayload: Cell | null = null,
        query_id: number | bigint = 0
    ) {
        return beginCell()
            .storeUint(OP_CODES.TRANSFER, 32)
            .storeUint(query_id, 64)
            .storeCoins(amount)
            .storeAddress(to)
            .storeAddress(responseAddress)
            .storeBit(false) // null custom_payload
            .storeCoins(forwardAmount)
            .storeMaybeRef(forwardPayload)
            .endCell();
    }

    async sendTransfer(
        walletProvider: WalletProvider,
        to: Address,
        amount: bigint,
        responseAddress: Address | null = null,
        forwardAmount: bigint = 0n,
        forwardPayload: Cell | null = null
    ) {
        await this.sendTransaction(
            walletProvider,
            this.address,
            toNano(0.05) + forwardAmount,
            JettonWallet.transferMessage(to, amount, responseAddress, forwardAmount, forwardPayload)
        );
    }
    
    async getWalletData(walletProvider: WalletProvider) {
        const client = walletProvider.getWalletClient();
        const result = await client.provider(this.address).get('get_wallet_data', []);
        const balance = result.stack.readBigNumber();
        const owner = result.stack.readAddress();
        const jettonMaster = result.stack.readAddress();
        const walletCode = result.stack.readCell();
        
        return {
            balance,
            owner,
            jettonMaster,
            walletCode
        };
    }

    async getBalance(provider: WalletProvider) {
        const data = await this.getWalletData(provider);
        return data.balance;
    }

    async getOwner(provider: WalletProvider) {
        const data = await this.getWalletData(provider);
        return data.owner;
    }
} 