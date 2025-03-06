import { Address, TupleReader } from "@ton/core";
import { WalletProvider } from "../../providers/wallet";
import { getNftOwner } from "../../utils/NFTItem";
import {
  ListingData,
  FixedPriceListingData,
  AuctionListingData,
  FixedPriceData,
  AuctionData,
  parseFixedPriceDataFromStack,
  parseAuctionDataFromStack
} from "./interfaces/listings.ts";

export function isAuction(stack: TupleReader): boolean {
  return stack.remaining === 20;
}

export async function getListingData(walletProvider: WalletProvider, nftAddress: string): Promise<ListingData> {
  try {
    const listingAddress = await getNftOwner(walletProvider, nftAddress);
    const client = walletProvider.getWalletClient();
    const result = await client.runMethod(listingAddress, "get_sale_data");
    
    if (!isAuction(result.stack)) {
      return parseFixedPriceData(listingAddress, result.stack);
    } else {
      return parseAuctionData(listingAddress, result.stack);
    }
  } catch (error) {
    throw new Error(`Failed to get listing data: ${error.message}`);
  }
}

function parseFixedPriceData(listingAddress: Address, stack: TupleReader): FixedPriceListingData {
  const fullData = parseFixedPriceDataFromStack(stack);
  
  // Return only what's needed for the simplified interface
  return {
    listingAddress,
    owner: fullData.owner,
    fullPrice: fullData.fullPrice,
    isAuction: false
  };
}

function parseAuctionData(listingAddress: Address, stack: TupleReader): AuctionListingData {
  const fullData = parseAuctionDataFromStack(stack);
  
  // Return only what's needed for the simplified interface
  return {
    listingAddress,
    owner: fullData.owner,
    fullPrice: fullData.maxBid, // Max bid serves as the "buy now" price
    minBid: fullData.minBid,
    lastBid: fullData.lastBid,
    maxBid: fullData.maxBid,
    endTime: fullData.endTime,
    isAuction: true
  };
}

export async function getFixedPriceData(walletProvider: WalletProvider, nftAddress: string): Promise<FixedPriceData & { listingAddress: Address }> {
  try {
    const listingAddress = await getNftOwner(walletProvider, nftAddress);
    const client = walletProvider.getWalletClient();
    const result = await client.runMethod(listingAddress, "get_sale_data");
    
    if (isAuction(result.stack)) {
      throw new Error("Not a fixed price listing");
    }
    
    const data = parseFixedPriceDataFromStack(result.stack);
    
    // Return with listingAddress attached
    return {
      ...data,
      listingAddress
    };
  } catch (error) {
    throw new Error(`Failed to get fixed price data: ${error.message}`);
  }
}

export async function getAuctionData(walletProvider: WalletProvider, nftAddress: string): Promise<AuctionData & { listingAddress: Address }> {
  try {
    const listingAddress = await getNftOwner(walletProvider, nftAddress);
    const client = walletProvider.getWalletClient();
    const result = await client.runMethod(listingAddress, "get_sale_data");
    
    if (!isAuction(result.stack)) {
      throw new Error("Not an auction listing");
    }
    
    const data = parseAuctionDataFromStack(result.stack);
    
    // Return with listingAddress attached
    return {
      ...data,
      listingAddress
    };
  } catch (error) {
    throw new Error(`Failed to get auction data: ${error.message}`);
  }
}

export async function getBuyPrice(walletProvider: WalletProvider, nftAddress: string): Promise<bigint> {
  const listingData = await getListingData(walletProvider, nftAddress);
  return listingData.fullPrice;
}

export async function getMinBid(walletProvider: WalletProvider, nftAddress: string): Promise<bigint> {
  const listingData = await getListingData(walletProvider, nftAddress);
  if (!listingData.isAuction) {
    throw new Error("Not an auction listing");
  }
  return listingData.minBid;
}

export async function getLastBid(walletProvider: WalletProvider, nftAddress: string): Promise<bigint> {
  const listingData = await getListingData(walletProvider, nftAddress);
  if (!listingData.isAuction) {
    throw new Error("Not an auction listing");
  }
  return listingData.lastBid;
}

export async function isAuctionEnded(walletProvider: WalletProvider, nftAddress: string): Promise<boolean> {
  const listingData = await getListingData(walletProvider, nftAddress);
  if (!listingData.isAuction) {
    throw new Error("Not an auction listing");
  }
  
  const now = Math.floor(Date.now() / 1000);
  return now > listingData.endTime;
}

export async function getNextValidBidAmount(walletProvider: WalletProvider, nftAddress: string): Promise<bigint> {
  const listingData = await getListingData(walletProvider, nftAddress);
  if (!listingData.isAuction) {
    throw new Error("Not an auction listing");
  }
  
  if (listingData.lastBid === BigInt(0)) {
    return listingData.minBid;
  }
  
  // Get complete auction data to access minStep
  const auctionData = await getAuctionData(walletProvider, nftAddress);
  const minIncrement = (listingData.lastBid * BigInt(auctionData.minStep)) / BigInt(100);
  return listingData.lastBid + minIncrement;
}
