export const PLATFORM_TYPES = ["TON_WHALES", "HIPO"] as const;
export type PlatformType = (typeof PLATFORM_TYPES)[number];

export const STAKING_POOL_ADDRESSES: Record<PlatformType, string[]> = {
  TON_WHALES: [
    "kQDV1LTU0sWojmDUV4HulrlYPpxLWSUjM6F3lUurMbwhales",
    "kQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK26F",
  ],
  HIPO: ["kQAlDMBKCT8WJ4nwdwNRp0lvKMP4vUnHYspFPhEnyR36cg44"],
};


