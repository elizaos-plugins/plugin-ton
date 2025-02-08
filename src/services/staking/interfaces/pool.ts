import { Address } from "@ton/ton";

export type PoolMemberList = PoolMemberData[];

export interface PoolMemberData {
    address: Address;      
    profit_per_coin: bigint;
    balance: bigint;
    pending_withdraw: bigint;
    pending_withdraw_all: boolean;
    pending_deposit: bigint;
    member_withdraw: bigint;
}

export interface PoolInfo {
    address: Address;
    min_stake: bigint;
    deposit_fee: bigint;
    withdraw_fee: bigint;
    balance: bigint;
    pending_deposits: bigint;
    pending_withdraw: bigint;
}
