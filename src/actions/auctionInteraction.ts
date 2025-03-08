import {
  elizaLogger,
  composeContext,
  generateObject,
  ModelClass,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  Content,
} from "@elizaos/core";
import { Address, internal, SendMode, toNano, beginCell } from "@ton/ton";
import { Builder } from "@ton/ton";
import { z } from "zod";
import { initWalletProvider, WalletProvider } from "../providers/wallet";
import { waitSeqnoContract } from "../utils/util";
import { buildNftFixPriceSaleV3R3DeploymentBody, destinationAddress, marketplaceAddress, marketplaceFeeAddress } from "../services/nft-marketplace/listingFactory";

/**
 * Schema for auction interaction input.
 *
 * - auctionAddress: The auction contract address.
 * - auctionAction: One of "getAuctionData", "bid", "stop", "cancel", "list", "buy", "changePrice", "addValue", "cancelOffer", "getOfferData".
 * - bidAmount: For a bid action, the bid value (e.g., "2" for 2 TON) as a string.
 * - senderAddress: For actions that send an internal message (bid, stop, cancel); represents the caller's address.
 * - nftAddress: For a list action, the NFT contract address.
 * - fullPrice: For a list action, the full price of the NFT in TON.
 * - marketplaceAddress: For a list action, the marketplace contract address.
 * - marketplaceFeeAddress: For a list action, the fee recipient address.
 * - marketplaceFeePercent: For a list action, the marketplace fee percentage.
 * - royaltyAddress: For a list action, the royalty recipient address.
 * - royaltyPercent: For a list action, the royalty percentage.
 * - newPrice: For a changePrice action, the new price of the NFT in TON.
 * - additionalValue: For addValue action, the additional value to add to the offer.
 */
const OP_CODES = {
  FIX_PRICE_BUY: 2n,
  FIX_PRICE_CANCEL: 3n,
  FIX_PRICE_CHANGE_PRICE: 0xfd135f7bn,
  OFFER_CANCEL: 3n,
} as const;

const auctionInteractionSchema = z
  .object({
    auctionAddress: z.string().nonempty("Auction address is required"),
    auctionAction: z.enum([
      "getAuctionData",
      "bid",
      "stop",
      "cancel",
      "list",
      "buy",
      "changePrice",
      "addValue",
      "cancelOffer",
      "getOfferData",
    ]),
    bidAmount: z.string().optional(),
    senderAddress: z.string().optional(),
    nftAddress: z.string().optional(),
    fullPrice: z.string().optional(),
    marketplaceAddress: z.string().optional(),
    marketplaceFeeAddress: z.string().optional(),
    marketplaceFeePercent: z.number().optional(),
    royaltyAddress: z.string().optional(),
    royaltyPercent: z.number().optional(),
    newPrice: z.string().optional(),
    additionalValue: z.string().optional(),
  })
  .refine(
    (data) =>
      data.auctionAction !== "bid" ||
      (data.auctionAction === "bid" && data.bidAmount && data.senderAddress),
    {
      message: "For a bid action, bidAmount and senderAddress are required",
      path: ["bidAmount", "senderAddress"],
    }
  )
  .refine(
    (data) =>
      (data.auctionAction === "stop" || data.auctionAction === "cancel") ===
        false || !!data.senderAddress,
    {
      message: "For stop or cancel actions, senderAddress is required",
      path: ["senderAddress"],
    }
  )
  .refine(
    (data) =>
      data.auctionAction !== "list" ||
      (data.auctionAction === "list" &&
        data.nftAddress &&
        data.fullPrice &&
        data.marketplaceAddress &&
        data.marketplaceFeeAddress &&
        data.marketplaceFeePercent &&
        data.royaltyAddress &&
        data.royaltyPercent),
    {
      message: "For list action, all NFT sale parameters are required",
      path: ["nftAddress", "fullPrice", "marketplaceAddress"],
    }
  )
  .refine(
    (data) =>
      data.auctionAction !== "changePrice" ||
      (data.auctionAction === "changePrice" && data.newPrice),
    {
      message: "For changePrice action, newPrice is required",
      path: ["newPrice"],
    }
  )
  .refine(
    (data) =>
      data.auctionAction !== "addValue" ||
      (data.auctionAction === "addValue" && data.additionalValue),
    {
      message: "For addValue action, additionalValue is required",
      path: ["additionalValue"],
    }
  );

export interface AuctionInteractionContent extends Content {
  auctionAddress: string;
  auctionAction:
    | "getAuctionData"
    | "bid"
    | "stop"
    | "cancel"
    | "list"
    | "buy"
    | "changePrice"
    | "addValue"
    | "cancelOffer"
    | "getOfferData";
  bidAmount?: string;
  senderAddress?: string;
  nftAddress?: string;
  fullPrice?: string;
  marketplaceAddress?: string;
  marketplaceFeeAddress?: string;
  marketplaceFeePercent?: number;
  royaltyAddress?: string;
  royaltyPercent?: number;
  newPrice?: string;
  additionalValue?: string;
}

function isAuctionInteractionContent(
  content: Content
): content is AuctionInteractionContent {
  return (
    typeof content.auctionAddress === "string" &&
    typeof content.auctionAction === "string"
  );
}

const auctionInteractionTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
Example response:
\`\`\`json
{
  "auctionAddress": "<Auction contract address>",
  "auctionAction": "<getAuctionData|bid|stop|cancel|list|buy|changePrice|addValue|cancelOffer|getOfferData>",
  "bidAmount": "<Bid amount in TON, required for 'bid' action>",
  "senderAddress": "<Sender's TON address, required for actions other than 'getAuctionData'>",
  "nftAddress": "<NFT address for listing>",
  "fullPrice": "<Full price in TON>",
  "marketplaceAddress": "<Marketplace address>",
  "marketplaceFeeAddress": "<Fee recipient address>",
  "marketplaceFeePercent": "<Marketplace fee percentage>",
  "royaltyAddress": "<Royalty recipient address>",
  "royaltyPercent": "<Royalty percentage>",
  "newPrice": "<New price in TON>",
  "additionalValue": "<Additional value for addValue action>"
}
\`\`\`

{{recentMessages}}

Respond with a JSON markdown block containing only the extracted values.`;

/**
 * Helper function to build auction interaction parameters.
 */
const buildAuctionInteractionData = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State
): Promise<AuctionInteractionContent> => {
  const context = composeContext({
    state,
    template: auctionInteractionTemplate,
  });
  const content = await generateObject({
    runtime,
    context,
    schema: auctionInteractionSchema as any,
    modelClass: ModelClass.SMALL,
  });
  return content.object as any;
};

/**
 * AuctionInteractionAction encapsulates the core logic to interact with an auction contract.
 */
export class AuctionInteractionAction {
  private walletProvider: WalletProvider;
  constructor(walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
  }

  /**
   * Retrieves auction sale data by calling the "get_auction_data" method on the auction contract.
   * The decoding here is demonstrative; actual fields depend on your auction contract's ABI.
   */
  async getAuctionData(auctionAddress: string): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const addr = Address.parse(auctionAddress);
    const result = await client.runMethod(addr, "get_auction_data");

    // console.log("getSaleData result:", result);

    try {
      const activated = result.stack.readNumber();
      const end = result.stack.readNumber();
      const end_time = result.stack.readNumber();
      const mp_addr = result.stack.readAddress()?.toString() || "";
      const nft_addr = result.stack.readAddress()?.toString() || "";
      let nft_owner: string;
      try {
        nft_owner = result.stack.readAddress()?.toString() || "";
      } catch (e) {
        nft_owner = "";
      }
      const last_bid = result.stack.readNumber();
      const last_member = result.stack.readAddress()?.toString() || "";
      const min_step = result.stack.readNumber();
      const mp_fee_addr = result.stack.readAddress()?.toString() || "";
      const mp_fee_factor = result.stack.readNumber();
      const mp_fee_base = result.stack.readNumber();
      const royalty_fee_addr = result.stack.readAddress()?.toString() || "";
      const royalty_fee_factor = result.stack.readNumber();
      const royalty_fee_base = result.stack.readNumber();
      const max_bid = result.stack.readNumber();
      const min_bid = result.stack.readNumber();
      let created_at: number | null = null;
      try {
        created_at = result.stack.readNumber();
      } catch (e) {
        created_at = null;
      }
      const last_bid_at = result.stack.readNumber();
      const is_canceled = result.stack.readNumber();
      const step_time = result.stack.readNumber();
      const last_query_id = result.stack.readNumber();

      return {
        auctionAddress,
        activated,
        end,
        end_time,
        mp_addr,
        nft_addr,
        nft_owner,
        last_bid,
        last_member,
        min_step,
        mp_fee_addr,
        mp_fee_factor,
        mp_fee_base,
        royalty_fee_addr,
        royalty_fee_factor,
        royalty_fee_base,
        max_bid,
        min_bid,
        created_at,
        last_bid_at,
        is_canceled,
        step_time,
        last_query_id,
        message: "Auction sale data fetched successfully",
      };
    } catch (parseError) {
      elizaLogger.error("Error parsing sale data:", parseError);
      return { error: "Failed to parse sale data" };
    }
  }

  /**
   * Sends a bid by creating and sending an internal message with an empty bid body.
   */
  async bid(auctionAddress: string, bidAmount: string): Promise<any> {
    const auctionAddr = Address.parse(auctionAddress);
    // Create an empty cell for the bid message body.
    const bidMessage = internal({
      to: auctionAddr,
      value: toNano(bidAmount),
      bounce: true,
      body: "",
    });

    const contract = this.walletProvider
      .getWalletClient()
      .open(this.walletProvider.wallet);

    const seqno = await contract.getSeqno();
    // Send message using the TON client.
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [bidMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);

    return {
      auctionAddress,
      bidAmount,
      message: "Bid placed successfully",
    };
  }

  /**
   * Sends a stop-auction message.
   */
  async stop(auctionAddress: string): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const seqno = await contract.getSeqno();

    const auctionAddr = Address.parse(auctionAddress);
    // based on https://github.com/getgems-io/nft-contracts/blob/7654183fea73422808281c8336649b49ce9939a2/packages/contracts/nft-auction-v2/NftAuctionV2.data.ts#L86
    const stopBody = new Builder()
      .storeUint(0, 32)
      .storeBuffer(Buffer.from("stop"))
      .endCell();
    const stopMessage = internal({
      to: auctionAddr,
      value: toNano("0.05"),
      bounce: true,
      body: stopBody,
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [stopMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      message: "Stop auction message sent successfully",
    };
  }

  /**
   * Sends a cancel auction message using a placeholder opcode (0xDEADBEEF).
   */
  async cancel(auctionAddress: string): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const auctionAddr = Address.parse(auctionAddress);
    // based on https://github.com/getgems-io/nft-contracts/blob/7654183fea73422808281c8336649b49ce9939a2/packages/contracts/nft-auction-v2/NftAuctionV2.data.ts#L90
    const cancelBody = new Builder()
      .storeUint(0, 32)
      .storeBuffer(Buffer.from("cancel"))
      .endCell();
    const seqno = await contract.getSeqno();
    const cancelMessage = internal({
      to: auctionAddr,
      value: toNano("0.05"),
      bounce: true,
      body: cancelBody,
    });
    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [cancelMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });
    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);
    return {
      auctionAddress,
      message: "Cancel auction message sent successfully",
    };
  }

  /**
   * Lists an NFT for sale
   */
  async list(params: AuctionInteractionContent): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const auctionAddr = Address.parse(params.auctionAddress);

    //const saleData = {
    //  isComplete: false,
    //  marketplaceAddress: Address.parse(params.marketplaceAddress!),
    //  nftOwnerAddress: this.walletProvider.wallet.address,
    //  fullTonPrice: toNano(params.fullPrice!),
    //  soldAtTime: 0,
    //  soldQueryId: 0n,
    //  marketplaceFeeAddress: Address.parse(params.marketplaceFeeAddress!),
    //  royaltyAddress: Address.parse(params.royaltyAddress!),
    //  marketplaceFeePercent: params.marketplaceFeePercent!,
    //  royaltyPercent: params.royaltyPercent!,
    //  nftAddress: Address.parse(params.nftAddress!),
    //  createdAt: Math.floor(Date.now() / 1000),
    //  publicKey: null,
    //};

    const fullPrice = toNano(params.fullPrice!);
    const royalty = 5;
    const fee = 5;

    const saleData = {
      nftAddress: Address.parse(params.nftAddress),
      nftOwnerAddress: this.walletProvider.wallet.address,
      deployerAddress: destinationAddress,
      marketplaceAddress: marketplaceAddress,
      marketplaceFeeAddress: marketplaceFeeAddress,
      marketplaceFeePercent: (fullPrice / BigInt(100)) * BigInt(fee),
      royaltyAddress: this.walletProvider.wallet.address,
      royaltyPercent: (fullPrice / BigInt(100)) * BigInt(royalty),
      fullTonPrice: fullPrice,
    };

    const saleBody = await buildNftFixPriceSaleV3R3DeploymentBody(saleData); //buildNftFixPriceSaleV4R1Data(saleData);

    const seqno = await contract.getSeqno();
    const listMessage = internal({
      to: params.nftAddress,
      value: toNano("0.3"), // Sufficient value for all operations
      bounce: true,
      body: saleBody
    });

    const transfer = await contract.sendTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [listMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await waitSeqnoContract(seqno, contract);

    return {
      auctionAddress: params.auctionAddress,
      nftAddress: params.nftAddress,
      fullPrice: params.fullPrice,
      message: "NFT listed for sale successfully",
    };
  }

  /**
   * Buys an NFT from a fixed price sale contract
   */
  async buy(auctionAddress: string): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const addr = Address.parse(auctionAddress);
    const result = await client.runMethod(addr, "get_fix_price_data_v4");

    const fullPrice = result.stack.readNumber();
    const minGasAmount = toNano("0.1"); // 0.1 TON as specified in contract

    const seqno = await contract.getSeqno();
    const buyMessage = internal({
      to: addr,
      value: BigInt(fullPrice) + minGasAmount,
      bounce: true,
      body: new Builder().storeUint(OP_CODES.FIX_PRICE_BUY, 32).endCell(),
    });

    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [buyMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);

    return {
      auctionAddress,
      price: fullPrice.toString(),
      message: "Buy message sent successfully",
    };
  }

  /**
   * Changes the price of a listed NFT
   */
  async changePrice(auctionAddress: string, newPrice: string): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const addr = Address.parse(auctionAddress);
    const seqno = await contract.getSeqno();

    const changePriceMessage = internal({
      to: addr,
      value: toNano("0.05"),
      bounce: true,
      body: new Builder()
        .storeUint(OP_CODES.FIX_PRICE_CHANGE_PRICE, 32)
        .storeCoins(toNano(newPrice))
        .storeDict(undefined)
        .endCell(),
    });

    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [changePriceMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);

    return {
      auctionAddress,
      newPrice,
      message: "Price changed successfully",
    };
  }

  /**
   * Adds value to an existing offer
   */
  async addValue(
    auctionAddress: string,
    additionalValue: string
  ): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const addr = Address.parse(auctionAddress);
    const seqno = await contract.getSeqno();

    const addValueMessage = internal({
      to: addr,
      value: toNano(additionalValue),
      bounce: true,
      body: new Builder().storeUint(0, 32).endCell(), // op = 0 for adding value
    });

    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [addValueMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);

    return {
      auctionAddress,
      additionalValue,
      message: "Value added to offer successfully",
    };
  }

  /**
   * Cancels an NFT offer
   */
  async cancelOffer(auctionAddress: string): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const addr = Address.parse(auctionAddress);
    const seqno = await contract.getSeqno();

    const cancelMessage = internal({
      to: addr,
      value: toNano("0.05"),
      bounce: true,
      body: new Builder().storeUint(OP_CODES.OFFER_CANCEL, 32).endCell(),
    });

    const transfer = await contract.createTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [cancelMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await contract.send(transfer);
    await waitSeqnoContract(seqno, contract);

    return {
      auctionAddress,
      message: "Offer cancelled successfully",
    };
  }

  /**
   * Gets offer data
   */
  async getOfferData(auctionAddress: string): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const addr = Address.parse(auctionAddress);
    const result = await client.runMethod(addr, "get_offer_data_v2");

    // Read values individually from stack
    const magic = result.stack.readNumber();
    const isComplete = result.stack.readNumber();
    const createdAt = result.stack.readNumber();
    const finishAt = result.stack.readNumber();
    const swapAt = result.stack.readNumber();
    const marketplaceAddress = result.stack.readAddress();
    const nftAddress = result.stack.readAddress();
    const offerOwnerAddress = result.stack.readAddress();
    const fullPrice = result.stack.readNumber();
    const marketplaceFeeAddress = result.stack.readAddress();
    const marketplaceFactor = result.stack.readNumber();
    const marketplaceBase = result.stack.readNumber();
    const royaltyAddress = result.stack.readAddress();
    const royaltyFactor = result.stack.readNumber();
    const royaltyBase = result.stack.readNumber();
    const profitPrice = result.stack.readNumber();

    return {
      auctionAddress,
      isComplete: isComplete.toString(),
      createdAt: createdAt.toString(),
      finishAt: finishAt.toString(),
      swapAt: swapAt.toString(),
      marketplaceAddress: marketplaceAddress?.toString() || "",
      nftAddress: nftAddress?.toString() || "",
      offerOwnerAddress: offerOwnerAddress?.toString() || "",
      fullPrice: fullPrice.toString(),
      marketplaceFeeAddress: marketplaceFeeAddress?.toString() || "",
      marketplaceFactor: marketplaceFactor.toString(),
      marketplaceBase: marketplaceBase.toString(),
      royaltyAddress: royaltyAddress?.toString() || "",
      royaltyFactor: royaltyFactor.toString(),
      royaltyBase: royaltyBase.toString(),
      profitPrice: profitPrice.toString(),
      message: "Offer data fetched successfully",
    };
  }
}

export default {
  name: "INTERACT_AUCTION",
  similes: ["AUCTION_INTERACT", "AUCTION_ACTION"],
  description:
    "Interacts with an auction contract. Supports actions: getSaleData, bid, stop, and cancel.",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log("Starting INTERACT_AUCTION handler...");
    const params = await buildAuctionInteractionData(runtime, message, state);

    if (!isAuctionInteractionContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process auction interaction request. Invalid content provided.",
          content: { error: "Invalid get auction interaction content" },
        });
      }
      return false;
    }

    try {
      const walletProvider = await initWalletProvider(runtime);
      const auctionAction = new AuctionInteractionAction(walletProvider);
      let result: any;
      switch (params.auctionAction) {
        case "getAuctionData":
          result = await auctionAction.getAuctionData(params.auctionAddress);
          break;
        case "bid":
          result = await auctionAction.bid(
            params.auctionAddress,
            params.bidAmount!
          );
          break;
        case "stop":
          result = await auctionAction.stop(params.auctionAddress);
          break;
        case "cancel":
          result = await auctionAction.cancel(params.auctionAddress);
          break;
        case "list":
          result = await auctionAction.list(params);
          break;
        case "buy":
          result = await auctionAction.buy(params.auctionAddress);
          break;
        case "changePrice":
          result = await auctionAction.changePrice(
            params.auctionAddress,
            params.newPrice!
          );
          break;
        case "addValue":
          result = await auctionAction.addValue(
            params.auctionAddress,
            params.additionalValue!
          );
          break;
        case "cancelOffer":
          result = await auctionAction.cancelOffer(params.auctionAddress);
          break;
        case "getOfferData":
          result = await auctionAction.getOfferData(params.auctionAddress);
          break;
        default:
          throw new Error("Invalid auction action");
      }
      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result,
        });
      }
    } catch (error: any) {
      elizaLogger.error("Error in INTERACT_AUCTION handler:", error);
      if (callback) {
        callback({
          text: `Error in INTERACT_AUCTION: ${error.message}`,
          content: { error: error.message },
        });
      }
    }
    return true;
  },
  template: auctionInteractionTemplate,
  // eslint-disable-next-line
  validate: async (_runtime: IAgentRuntime) => {
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "getAuctionData",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Auction sale data fetched successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "bid",
          bidAmount: "2",
          senderAddress: "EQBidderAddressExample",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Bid placed successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "stop",
          senderAddress: "EQOwnerAddressExample",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Stop auction message sent successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "cancel",
          senderAddress: "EQOwnerAddressExample",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Cancel auction message sent successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "list",
          nftAddress: "EQNftAddressExample",
          fullPrice: "10",
          marketplaceAddress: "EQMarketplaceAddressExample",
          marketplaceFeeAddress: "EQFeeAddressExample",
          marketplaceFeePercent: 5,
          royaltyAddress: "EQRoyaltyAddressExample",
          royaltyPercent: 2,
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT listed for sale successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "buy",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Buy message sent successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "changePrice",
          newPrice: "15",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Price changed successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "addValue",
          additionalValue: "10",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Value added to offer successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "cancelOffer",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Offer cancelled successfully",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          auctionAddress: "EQAuctionAddressExample",
          auctionAction: "getOfferData",
          action: "INTERACT_AUCTION",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Offer data fetched successfully",
        },
      },
    ],
  ],
};
