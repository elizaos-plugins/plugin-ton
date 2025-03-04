export * from "./torchFinance";
export * from "./dedust";
export * from "./stonFi";
export type * from "./dex.d.ts";

export enum SupportedMethod {
  CREATE_POOL,
  DEPOSIT,
  WITHDRAW,
  CLAIM_FEE,
}
export const SUPPORTED_DEXES = [
    "TORCH_FINANCE",
    "STON_FI",
    "DEDUST",
];

export const isPoolSupported = (poolName: string) =>
    SUPPORTED_DEXES.includes(poolName);