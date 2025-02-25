import {
  Address,
  beginCell,
  Cell,
  StateInit,
  storeStateInit,
  toNano,
} from "@ton/core";

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

function assertPercent(value: number): number {
  if (value < 0 || value > 100) throw new Error("Invalid percent value");
  return Math.floor(value * 1000);
}

export function buildNftFixPriceSaleV4R1Data(
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

export async function buildNftFixPriceSaleV3R3Data(
  cfg: NftFixPriceSaleV3R3Data
) {
  // func:0.4.4 src:op-codes.fc, imports/stdlib.fc, nft-fixprice-sale-v3r3.fc
  // If GetGems updates its sale smart contract, you will need to obtain the new smart contract from https://github.com/getgems-io/nft-contracts/blob/main/packages/contracts/nft-fixprice-sale-v3/NftFixpriceSaleV3.source.ts.
  const NftFixPriceSaleV3R3CodeBoc =
    "te6ccgECDwEAA5MAART/APSkE/S88sgLAQIBYgIDAgLNBAUCASANDgL30A6GmBgLjYSS+CcH0gGHaiaGmAaY/9IH0gfSB9AGppj+mfmBg4KYVjgGAASpiFaY+F7xDhgEoYBWmfxwjFsxsLcxsrZBZjgsk5mW8oBfEV4ADJL4dwEuuk4QEWQIEV3RXgAJFZ2Ngp5OOC2HGBFWAA+WjKFkEINjYQQF1AYHAdFmCEAX14QBSYKBSML7y4cIk0PpA+gD6QPoAMFOSoSGhUIehFqBSkCH6RFtwgBDIywVQA88WAfoCy2rJcfsAJcIAJddJwgKwjhtQRSH6RFtwgBDIywVQA88WAfoCy2rJcfsAECOSNDTiWoMAGQwMWyy1DDQ0wchgCCw8tGVIsMAjhSBAlj4I1NBobwE+CMCoLkTsPLRlpEy4gHUMAH7AATwU8fHBbCOXRNfAzI3Nzc3BPoA+gD6ADBTIaEhocEB8tGYBdD6QPoA+kD6ADAwyDICzxZY+gIBzxZQBPoCyXAgEEgQNxBFEDQIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVOCz4wIwMTcowAPjAijAAOMCCMACCAkKCwCGNTs7U3THBZJfC+BRc8cF8uH0ghAFE42RGLry4fX6QDAQSBA3VTIIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVADiODmCEAX14QAYvvLhyVNGxwVRUscFFbHy4cpwIIIQX8w9FCGAEMjLBSjPFiH6Astqyx8Vyz8nzxYnzxYUygAj+gITygDJgwb7AHFwVBcAXjMQNBAjCMjLABfLH1AFzxZQA88WAc8WAfoCzMsfyz/J7VQAGDY3EDhHZRRDMHDwBQAgmFVEECQQI/AF4F8KhA/y8ADsIfpEW3CAEMjLBVADzxYB+gLLaslx+wBwIIIQX8w9FMjLH1Iwyz8kzxZQBM8WE8oAggnJw4D6AhLKAMlxgBjIywUnzxZw+gLLaswl+kRbyYMG+wBxVWD4IwEIyMsAF8sfUAXPFlADzxYBzxYB+gLMyx/LP8ntVACHvOFnaiaGmAaY/9IH0gfSB9AGppj+mfmC3ofSB9AH0gfQAYKaFQkNDggPlozJP9Ii2TfSItkf0iLcEIIySsKAVgAKrAQAgb7l72omhpgGmP/SB9IH0gfQBqaY/pn5gBaH0gfQB9IH0AGCmxUJDQ4ID5aM0U/SItlH0iLZH9Ii2F4ACFiBqqiU";
  const NftFixPriceSaleV3R3CodeCell = Cell.fromBoc(
    Buffer.from(NftFixPriceSaleV3R3CodeBoc, "base64")
  )[0];

  //const nftAddress = Address.parse('EQCUWoe7hLlklVxH8gduCf45vPNocsjRP4wbX42UJ0Ja0S2f');
  const price = toNano("5"); // 5 TON

  const feesData = beginCell()
    .storeAddress(cfg.marketplaceFeeAddress)
    // 5% - GetGems fee
    .storeCoins((price / BigInt(100)) * BigInt(5))
    .storeAddress(cfg.royaltyAddress)
    // 5% - Royalty, can be changed
    .storeCoins((price / BigInt(100)) * BigInt(0))
    .endCell();

  const saleData = beginCell()
    .storeBit(0) // is_complete
    .storeUint(Math.round(Date.now() / 1000), 32) // created_at
    .storeAddress(cfg.marketplaceAddress) // marketplace_address
    .storeAddress(cfg.nftAddress) // nft_address
    .storeAddress(cfg.nftOwnerAddress) // previous_owner_address
    .storeCoins(price) // full price in nanotons
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

export const marketplaceAddress = Address.parse('EQBYTuYbLf8INxFtD8tQeNk5ZLy-nAX9ahQbG_yl1qQ-GEMS'); // GetGems Address
export const marketplaceFeeAddress = Address.parse('EQCjk1hh952vWaE9bRguFkAhDAL5jj3xj9p0uPWrFBq_GEMS'); // GetGems Address for Fees
export const destinationAddress = Address.parse("EQAIFunALREOeQ99syMbO6sSzM_Fa1RsPD5TBoS0qVeKQ-AR"); // GetGems sale contracts deployer
