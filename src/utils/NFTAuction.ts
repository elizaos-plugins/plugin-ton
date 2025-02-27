import {
  Address,
  beginCell,
  Cell,
  StateInit,
  storeStateInit,
  toNano,
} from "@ton/core";
import { WalletProvider } from "../providers/wallet";
import { getNftOwner } from "./NFTItem";

export interface NftFixPriceSaleV4DR1Data {
  isComplete: boolean;
  marketplaceAddress: Address;
  nftOwnerAddress: Address;
  fullTonPrice: bigint;
  soldAtTime: number;
  soldQueryId: bigint;
  marketplaceFeeAddress: Address;
  royaltyAddress: Address;
  marketplaceFeePercent: number;
  royaltyPercent: number;
  nftAddress: Address;
  createdAt: number;
}

export interface NftFixPriceSaleV3R3Data {
  nftAddress: Address;
  nftOwnerAddress: Address;
  deployerAddress: Address;
  marketplaceAddress: Address;
  marketplaceFeeAddress: Address;
  marketplaceFeePercent: bigint;
  royaltyAddress: Address;
  royaltyPercent: bigint;
  fullTonPrice: bigint;
}

export interface NftAuctionV3R3Data {
  nftAddress: Address;
  nftOwnerAddress: Address;
  deployerAddress: Address;
  marketplaceAddress: Address;
  marketplaceFeeAddress: Address;
  marketplaceFeePercent: bigint;
  royaltyAddress: Address;
  royaltyPercent: bigint;
  minimumBid: bigint;
  maximumBid: bigint;
  expiryTime: number;
}

function assertPercent(value: number): number {
  if (value < 0 || value > 100) throw new Error("Invalid percent value");
  return Math.floor(value * 1000);
}

export function buildNftFixPriceSaleV4R1DeploymentBody(
  cfg: NftFixPriceSaleV4DR1Data & { publicKey: Buffer | null }
) {
  return beginCell()
    .storeBit(cfg.isComplete)
    .storeAddress(cfg.marketplaceAddress)
    .storeAddress(cfg.nftOwnerAddress)
    .storeCoins(cfg.fullTonPrice)
    .storeUint(cfg.soldAtTime, 32)
    .storeUint(cfg.soldQueryId, 64)
    .storeRef(
      beginCell()
        .storeAddress(cfg.marketplaceFeeAddress)
        .storeAddress(cfg.royaltyAddress)
        .storeUint(assertPercent(cfg.marketplaceFeePercent), 17)
        .storeUint(assertPercent(cfg.royaltyPercent), 17)
        .storeAddress(cfg.nftAddress)
        .storeUint(cfg.createdAt, 32)
        .endCell()
    )
    .storeDict(undefined) // empty jetton dict
    .storeMaybeBuffer(cfg.publicKey, 256 / 8)
    .endCell();
}

export async function buildNftFixPriceSaleV3R3DeploymentBody(
  cfg: NftFixPriceSaleV3R3Data
) {
  // func:0.4.4 src:op-codes.fc, imports/stdlib.fc, nft-fixprice-sale-v3r3.fc
  // If GetGems updates its sale smart contract, you will need to obtain the new smart contract from https://github.com/getgems-io/nft-contracts/blob/main/packages/contracts/nft-fixprice-sale-v3/NftFixpriceSaleV3.source.ts.
  const NftFixPriceSaleV3R3CodeBoc =
    "te6ccgECDwEAA5MAART/APSkE/S88sgLAQIBYgIDAgLNBAUCASANDgL30A6GmBgLjYSS+CcH0gGHaiaGmAaY/9IH0gfSB9AGppj+mfmBg4KYVjgGAASpiFaY+F7xDhgEoYBWmfxwjFsxsLcxsrZBZjgsk5mW8oBfEV4ADJL4dwEuuk4QEWQIEV3RXgAJFZ2Ngp5OOC2HGBFWAA+WjKFkEINjYQQF1AYHAdFmCEAX14QBSYKBSML7y4cIk0PpA+gD6QPoAMFOSoSGhUIehFqBSkCH6RFtwgBDIywVQA88WAfoCy2rJcfsAJcIAJddJwgKwjhtQRSH6RFtwgBDIywVQA88WAfoCy2rJcfsAECOSNDTiWoMAGQwMWyy1DDQ0wchgCCw8tGVIsMAjhSBAlj4I1NBobwE+CMCoLkTsPLRlpEy4gHUMAH7AATwU8fHBbCOXRNfAzI3Nzc3BPoA+gD6ADBTIaEhocEB8tGYBdD6QPoA+kD6ADAwyDICzxZY+gIBzxZQBPoCyXAgEEgQNxBFEDQIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVOCz4wIwMTcowAPjAijAAOMCCMACCAkKCwCGNTs7U3THBZJfC+BRc8cF8uH0ghAFE42RGLry4fX6QDAQSBA3VTIIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVADiODmCEAX14QAYvvLhyVNGxwVRUscFFbHy4cpwIIIQX8w9FCGAEMjLBSjPFiH6Astqyx8Vyz8nzxYnzxYUygAj+gITygDJgwb7AHFwVBcAXjMQNBAjCMjLABfLH1AFzxZQA88WAc8WAfoCzMsfyz/J7VQAGDY3EDhHZRRDMHDwBQAgmFVEECQQI/AF4F8KhA/y8ADsIfpEW3CAEMjLBVADzxYB+gLLaslx+wBwIIIQX8w9FMjLH1Iwyz8kzxZQBM8WE8oAggnJw4D6AhLKAMlxgBjIywUnzxZw+gLLaswl+kRbyYMG+wBxVWD4IwEIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVACHvOFnaiaGmAaY/9IH0gfSB9AGppj+mfmC3ofSB9AH0gfQAYKaFQkNDggPlozJP9Ii2TfSItkf0iLcEIIySsKAVgAKrAQAgb7l72omhpgGmP/SB9IH0gfQBqaY/pn5gBaH0gfQB9IH0AGCmxUJDQ4ID5aM0U/SItlH0iLZH9Ii2F4ACFiBqqiU";
  const NftFixPriceSaleV3R3CodeCell = Cell.fromBoc(
    Buffer.from(NftFixPriceSaleV3R3CodeBoc, "base64")
  )[0];

  const feesData = beginCell()
    .storeAddress(cfg.marketplaceFeeAddress)
    // 5% - GetGems fee
    .storeCoins((cfg.fullTonPrice / BigInt(100)) * BigInt(5))
    .storeAddress(cfg.royaltyAddress)
    // 5% - Royalty, can be changed
    .storeCoins((cfg.fullTonPrice / BigInt(100)) * BigInt(0))
    .endCell();

  const saleData = beginCell()
    .storeBit(0) // is_complete
    .storeUint(Math.round(Date.now() / 1000), 32) // created_at
    .storeAddress(cfg.marketplaceAddress) // marketplace_address
    .storeAddress(cfg.nftAddress) // nft_address
    .storeAddress(cfg.nftOwnerAddress) // previous_owner_address
    .storeCoins(cfg.fullTonPrice) // full price in nanotons
    .storeRef(feesData) // fees_cell
    .storeUint(0, 32) // sold_at
    .storeUint(0, 64) // query_id
    .endCell();

  const stateInit: StateInit = {
    code: NftFixPriceSaleV3R3CodeCell,
    data: saleData,
  };
  const stateInitCell = beginCell().store(storeStateInit(stateInit)).endCell();

  // not needed, just for example
  const saleContractAddress = new Address(0, stateInitCell.hash());

  const saleBody = beginCell()
    .storeUint(1, 32) // just accept coins on deploy
    .storeUint(0, 64)
    .endCell();

  const transferNftBody = beginCell()
    .storeUint(0x5fcc3d14, 32) // Opcode for NFT transfer
    .storeUint(0, 64) // query_id
    .storeAddress(cfg.deployerAddress) // new_owner
    .storeAddress(cfg.nftOwnerAddress) // response_destination for excesses
    .storeBit(0) // we do not have custom_payload
    .storeCoins(toNano("0.2")) // forward_amount
    .storeBit(0) // we store forward_payload is this cell
    .storeUint(0x0fe0ede, 31) // not 32, because we stored 0 bit before | do_sale opcode for deployer
    .storeRef(stateInitCell)
    .storeRef(saleBody)
    .endCell();

  return transferNftBody;
}

export async function buildNftAuctionV3R3DeploymentBody(
  cfg: NftAuctionV3R3Data
) {
  // func:0.4.4 src:op-codes.fc, imports/stdlib.fc, nft-fixprice-sale-v3r3.fc
  // If GetGems updates its sale smart contract, you will need to obtain the new smart contract from https://github.com/getgems-io/nft-contracts/blob/main/packages/contracts/nft-fixprice-sale-v3/NftFixpriceSaleV3.source.ts.
  const NftAuctionV3R3CodeBoc =
    "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"; // func:0.4.4 src:struct/msg-utils.func, struct/math.func, struct/exit-codes.func, struct/op-codes.func, ../imports/stdlib.fc, nft-auction-v3r3.func
  const NftAuctionV3R3CodeCell = Cell.fromBoc(
    Buffer.from(NftAuctionV3R3CodeBoc, "base64")
  )[0];

  const royaltyAddress = cfg.nftOwnerAddress;

  // For now we'll keep these hardcoded
  const minPercentStep = 5;
  const stepTimeSeconds = 60 * 60 * 24;

  const createdAt = Math.round(Date.now() / 1000);

  const constantData = beginCell()
    .storeAddress(cfg.marketplaceAddress)
    .storeCoins(cfg.minimumBid)
    .storeCoins(cfg.maximumBid)
    .storeUint(minPercentStep, 7)
    .storeUint(stepTimeSeconds, 17)
    .storeAddress(cfg.nftAddress)
    .storeUint(createdAt, 32)
    .endCell();

  const feesData = beginCell()
    .storeAddress(cfg.marketplaceFeeAddress)
    .storeAddress(cfg.royaltyAddress)
    .endCell();

  const storage = beginCell()
    .storeBit(0) // is_complete
    .storeBit(0) // is_active
    .storeBit(0)
    .storeBit(0) // current_bidder
    .storeCoins(0)
    .storeUint(0, 32) //last_bid_time
    .storeUint(cfg.expiryTime, 32) //end_timestamp
    .storeAddress(cfg.nftOwnerAddress)
    .storeUint(0, 64) //queryid
    .storeUint(0, 32)
    .storeUint(0, 32)
    .storeUint(0, 32)
    .storeUint(0, 32)
    .storeRef(feesData)
    .storeRef(constantData)
    .endCell();

  const stateInit: StateInit = {
    code: NftAuctionV3R3CodeCell,
    data: storage,
  };
  const stateInitCell = beginCell().store(storeStateInit(stateInit)).endCell();

  // not needed, just for example
  const saleContractAddress = new Address(0, stateInitCell.hash());

  const saleBody = beginCell()
    .storeUint(3, 32) // just accept coins on deploy
    .storeUint(0, 64)
    .endCell();

  const transferNftBody = beginCell()
    .storeUint(0x5fcc3d14, 32) // Opcode for NFT transfer
    .storeUint(0, 64) // query_id
    .storeAddress(cfg.deployerAddress) // new_owner
    .storeAddress(cfg.nftOwnerAddress) // response_destination for excesses
    .storeBit(0) // we do not have custom_payload
    .storeCoins(toNano("0.2")) // forward_amount
    .storeBit(0) // we store forward_payload is this cell
    .storeUint(0x0fe0ede, 31) // not 32, because we stored 0 bit before | do_sale opcode for deployer
    .storeRef(stateInitCell)
    .storeRef(saleBody)
    .endCell();

  return transferNftBody;
}

export async function getListingData(walletProvider: WalletProvider, nftAddress: string): Promise<{
  listingAddress: Address;
  owner: Address;
  fullPrice: bigint;
}> {
  try {
    const listingAddress = await getNftOwner(walletProvider, nftAddress);

    const client = walletProvider.getWalletClient();
    const result = await client.runMethod(listingAddress, "get_sale_data");

    result.stack.skip(5);

    const owner = result.stack.readAddress() as Address;
    const fullPrice = result.stack.readBigNumber();

    return {
      listingAddress,
      owner,
      fullPrice,
    };
  } catch (error) {
    throw new Error(`Failed to get listing data: ${error.message}`);
  }
}

export const marketplaceAddress = Address.parse(
  "EQBYTuYbLf8INxFtD8tQeNk5ZLy-nAX9ahQbG_yl1qQ-GEMS"
); // GetGems Address
export const marketplaceFeeAddress = Address.parse(
  "EQCjk1hh952vWaE9bRguFkAhDAL5jj3xj9p0uPWrFBq_GEMS"
); // GetGems Address for Fees
export const destinationAddress = Address.parse(
  "EQAIFunALREOeQ99syMbO6sSzM_Fa1RsPD5TBoS0qVeKQ-AR"
); // GetGems sale contracts deployer
