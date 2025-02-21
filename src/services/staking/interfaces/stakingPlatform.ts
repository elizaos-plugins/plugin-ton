import { Address, MessageRelaxed, TonClient } from "@ton/ton";
import { WalletProvider } from "../../../providers/wallet";
import { PoolInfo } from "./pool";

export interface StakingPlatform {
  readonly tonClient: TonClient;
  readonly walletProvider: WalletProvider;
  getStakedTon(walletAddress: Address, poolAddress: Address): Promise<bigint>;
  getPendingWithdrawal(walletAddress: Address, poolAddress: Address): Promise<bigint>;
  getPoolInfo(poolAddress: Address): Promise<PoolInfo>;
  createStakeMessage(poolAddress: Address, amount: number): Promise<MessageRelaxed>;
  createUnstakeMessage(poolAddress: Address, amount: number): Promise<MessageRelaxed>;
}