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
  import { z } from "zod";
  import { initWalletProvider, WalletProvider } from "../providers/wallet";
  import { getMinBid, getNextValidBidAmount, isAuctionEnded } from "../services/nft-marketplace/listingData";
  import { bidOnAuction } from "../services/nft-marketplace/listingTransactions";
import { toNano } from "@ton/core";
  
  /**
   * Schema for bid input.
   * Requires:
   * - nftAddress: The NFT contract address.
   * - Optional: bidAmount: The amount to bid (in nanoTON).
   */
  const bidAuctionSchema = z
    .object({
      nftAddress: z.string().nonempty("NFT address is required"),
      bidAmount: z.string().optional(),
    })
    .refine(
      (data) => data.nftAddress,
      {
        message: "NFT address is required",
        path: ["nftAddress"],
      }
    );
  
  export interface BidAuctionContent extends Content {
    nftAddress: string;
    bidAmount?: string;
  }
  
  function isBidAuctionContent(
    content: Content
  ): content is BidAuctionContent {
    return typeof content.nftAddress === "string";
  }
  
  const bidAuctionTemplate = `Respond with a JSON markdown block containing only the extracted values.
  Example response:
  \`\`\`json
  {
    "nftAddress": "<NFT address to bid on>",
    "bidAmount": "<optional bid amount in TON>"
  }
  \`\`\`
  
  {{recentMessages}}
  
  If no bid amount is provided, make bidAmount null or omit it.
  Respond with a JSON markdown block containing only the extracted values.`;
  
  /**
   * Helper function to build bid parameters.
   */
  const buildBidAuctionData = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<BidAuctionContent> => {
    const context = composeContext({
      state,
      template: bidAuctionTemplate,
    });
    const content = await generateObject({
      runtime,
      context,
      schema: bidAuctionSchema as any,
      modelClass: ModelClass.SMALL,
    });
    return content.object as any;
  };
  
  /**
   * BidAuctionAction encapsulates the logic to bid on an NFT auction.
   */
  export class BidAuctionAction {
    private walletProvider: WalletProvider;
    
    constructor(walletProvider: WalletProvider) {
      this.walletProvider = walletProvider;
    }
  
    /**
     * Validates whether the auction is valid for bidding
     */
    async validateAuction(nftAddress: string): Promise<{valid: boolean, message?: string}> {
      try {
        // Check if auction has ended
        const auctionEnded = await isAuctionEnded(this.walletProvider, nftAddress);
        if (auctionEnded) {
          return { valid: false, message: "This auction has already ended" };
        }
        
        return { valid: true };
      } catch (error: any) {
        if (error.message.includes("Not an auction listing")) {
          return { valid: false, message: "This is not an auction. Please use BUY_LISTING instead" };
        }
        throw error;
      }
    }
  
    /**
     * Places a bid on an NFT auction
     */
    async bid(nftAddress: string, bidAmount?: string): Promise<any> {
      try {
        elizaLogger.log(`Starting bid process for NFT: ${nftAddress}`);
        
        // First validate the auction
        const validationResult = await this.validateAuction(nftAddress);
        if (!validationResult.valid) {
          throw new Error(validationResult.message);
        }
        
        // Determine the bid amount
        let amount: bigint;
        if(!bidAmount) {
            amount = await getNextValidBidAmount(this.walletProvider, nftAddress);
        } else {
            amount = toNano(bidAmount);
        }

        // Place the bid
        const receipt = await bidOnAuction(this.walletProvider, nftAddress, amount);
        
        return receipt;
      } catch (error) {
        elizaLogger.error(`Error bidding on NFT ${nftAddress}: ${error}`);
        throw new Error(`Failed to bid on NFT: ${error.message}`);
      }
    }
  }
  
  export default {
    name: "BID_AUCTION",
    similes: ["NFT_BID", "PLACE_BID", "BID_NFT", "AUCTION_BID"],
    description:
      "Places a bid on an NFT auction by sending a transaction with the bid amount. If no bid is mentioned, the next valid bid amount is used.",
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      options: any,
      callback?: HandlerCallback
    ) => {
      elizaLogger.log("Starting BID_AUCTION handler...");
      const params = await buildBidAuctionData(runtime, message, state);
  
      if (!isBidAuctionContent(params)) {
        if (callback) {
          callback({
            text: "Unable to process bid request. Invalid content provided.",
            content: { error: "Invalid bid content" },
          });
        }
        return false;
      }
  
      try {
        const walletProvider = await initWalletProvider(runtime);
        const bidAuctionAction = new BidAuctionAction(walletProvider);
        
        const result = await bidAuctionAction.bid(params.nftAddress, params.bidAmount);
        
        if (callback) {
          callback({
            text: JSON.stringify(result, null, 2),
            content: result,
          });
        }
      } catch (error: any) {
        elizaLogger.error("Error in BID_AUCTION handler:", error);
        if (callback) {
          callback({
            text: `Error in BID_AUCTION: ${error.message}`,
            content: { error: error.message },
          });
        }
      }
      return true;
    },
    template: bidAuctionTemplate,
    // eslint-disable-next-line
    validate: async (_runtime: IAgentRuntime) => {
      return true;
    },
    examples: [
      [
        {
          user: "{{user1}}",
          content: {
            nftAddress: "EQNftAuctionAddressExample",
            bidAmount: "5000000000",
            action: "BID_AUCTION",
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
            nftAddress: "EQNftAuctionAddressExample",
            action: "BID_AUCTION",
          },
        },
        {
          user: "{{user1}}",
          content: {
            text: "Bid placed successfully with minimum valid bid",
          },
        },
      ]
    ],
  };