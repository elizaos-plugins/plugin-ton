import { Address, Contract, ContractProvider, Dictionary } from '@ton/ton'

export interface WalletState {
    tokens: bigint
    staking: Dictionary<bigint, bigint>
    unstaking: bigint
}

export class Wallet implements Contract {
    constructor(readonly address: Address) {}

    static createFromAddress(address: Address) {
        return new Wallet(address)
    }

    async getWalletState(provider: ContractProvider): Promise<WalletState> {
        const { stack } = await provider.get('get_wallet_state', [])
        return {
            tokens: stack.readBigNumber(),
            staking: Dictionary.loadDirect(
                Dictionary.Keys.BigUint(32),
                Dictionary.Values.BigVarUint(4),
                stack.readCellOpt(),
            ),
            unstaking: stack.readBigNumber(),
        }
    }
}
