import { JettonMaster } from "@ton/ton";

export type Token = {
  address: string;
  name: string;
};



export interface DEX {
  supportMethods: readonly SupportedMethod[];
  createPool?: (jettons: JettonMaster[]) => {};
  // LP tokens should be issued
  deposit?: (
    jettonDeposits: JettonDeposit[],
    tonAmount: number,
    params?: {}
  ) => {};
  // LP tokens should be burned
  withdraw?: (
    jettonWithdrawals: JettonWithdrawal[],
    isTon: boolean,
    amount: number,
    params?: {}
  ) => {};
  claimFee?: (params: { isTon: boolean; jettons: JettonMaster[] }) => {};
}

export type JettonDeposit = {
  jetton: JettonMaster;
  amount: number;
};

export type JettonWithdrawal = JettonDeposit;

export type TransactionHash = string;
