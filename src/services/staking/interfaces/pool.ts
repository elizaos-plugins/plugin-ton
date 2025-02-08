import { Address } from "@ton/ton";

export interface PoolMemberData {
    address: Address;      
    profit_per_coin: bigint;
    balance: bigint;
    pending_withdraw: bigint;
    pending_withdraw_all: boolean;
    pending_deposit: bigint;
    member_withdraw: bigint;
}

export type PoolMemberList = PoolMemberData[];
