import { Address } from '@ton/ton'

export const treasuryAddresses = new Map<string, Address>([
    ['mainnet', Address.parse('EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ')],
    ['testnet', Address.parse('kQAlDMBKCT8WJ4nwdwNRp0lvKMP4vUnHYspFPhEnyR36cg44')],
])

export const opDepositCoins = 0x3d3761a6
export const opUnstakeTokens = 0x595f07bc

export const feeStake = 100000000n
export const feeUnstake = 100000000n

export const minimumTonBalanceReserve = 200000000n
