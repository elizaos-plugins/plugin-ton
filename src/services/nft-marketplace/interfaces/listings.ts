import { Address, TupleReader } from "@ton/core";

interface BaseListingData {
  listingAddress: Address;
  isAuction: boolean;
}

export interface FixedPriceListingData extends BaseListingData {
  isAuction: false;
  owner: Address;
  fullPrice: bigint;
}

export interface AuctionListingData extends BaseListingData {
  isAuction: true;
  owner: Address;
  fullPrice: bigint;
  minBid: bigint;
  lastBid: bigint;
  maxBid: bigint;
  endTime: number;
}

export type ListingData = FixedPriceListingData | AuctionListingData;

export interface FixedPriceData {
  magic: number;
  isComplete: boolean;
  createdAt: number;
  marketplace: Address;
  nft: Address;
  owner: Address;
  fullPrice: bigint;
  marketFeeAddress: Address;
  marketFee: bigint;
  royaltyAddress: Address;
  royaltyAmount: bigint;
}

export interface AuctionData {
  magic: number;
  end: boolean;
  endTime: number;
  marketplace: Address;
  nft: Address;
  owner: Address;
  lastBid: bigint;
  lastMember: Address | null;
  minStep: number;
  marketFeeAddress: Address;
  mpFeeFactor: number;
  mpFeeBase: number;
  royaltyAddress: Address;
  royaltyFeeFactor: number;
  royaltyFeeBase: number;
  maxBid: bigint;
  minBid: bigint;
  createdAt: number;
  lastBidAt: number;
  isCanceled: boolean;
}

export function parseFixedPriceDataFromStack(
  stack: TupleReader
): FixedPriceData {
  return {
    magic: stack.readNumber(),
    isComplete: stack.readBoolean(),
    createdAt: stack.readNumber(),
    marketplace: stack.readAddress(),
    nft: stack.readAddress(),
    owner: stack.readAddress(),
    fullPrice: stack.readBigNumber(),
    marketFeeAddress: stack.readAddress(),
    marketFee: stack.readBigNumber(),
    royaltyAddress: stack.readAddress(),
    royaltyAmount: stack.readBigNumber(),
  };
}

export function parseAuctionDataFromStack(stack: TupleReader): AuctionData {
  return {
    magic: stack.readNumber(),
    end: stack.readBoolean(),
    endTime: stack.readNumber(),
    marketplace: stack.readAddress(),
    nft: stack.readAddress(),
    owner: stack.readAddress(),
    lastBid: stack.readBigNumber(),
    lastMember: stack.readAddressOpt(),
    minStep: stack.readNumber(),
    marketFeeAddress: stack.readAddress(),
    mpFeeFactor: stack.readNumber(),
    mpFeeBase: stack.readNumber(),
    royaltyAddress: stack.readAddress(),
    royaltyFeeFactor: stack.readNumber(),
    royaltyFeeBase: stack.readNumber(),
    maxBid: stack.readBigNumber(),
    minBid: stack.readBigNumber(),
    createdAt: stack.readNumber(),
    lastBidAt: stack.readNumber(),
    isCanceled: stack.readBoolean(),
  };
}
