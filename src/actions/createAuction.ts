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
  import { Address, internal, SendMode, toNano } from "@ton/core";
  import { z } from "zod";
  import { initWalletProvider, WalletProvider } from "../providers/wallet";
  import { waitSeqnoContract } from "../utils/util";
  import {
    buildNftAuctionV3R3Data,  // This function would need to be implemented in the utils
    destinationAddress,
    marketplaceAddress,
    marketplaceFeeAddress,
  } from "../utils/NFTAuction";
  
  // Configuration constants
  const CONFIG = {
    royaltyPercent: 5,
    marketplaceFeePercent: 5,
  };
  
  /**
   * Schema for create auction input.
   * Requires:
   * - nftAddress: The NFT contract address.
   * - minimumBid: The minimum bid for the auction in TON.
   * - maximumBid: The maximum bid (or buyout price) for the auction in TON.
   * - expiryTime: The expiry time for the auction in hours.
   */
  const createAuctionSchema = z
    .object({
      nftAddress: z.string().nonempty("NFT address is required"),
      minimumBid: z.string().nonempty("Minimum bid is required"),
      maximumBid: z.string().nonempty("Maximum bid (buyout price) is required"),
      expiryTime: z.string().nonempty("Expiry time is required"),
    })
    .refine((data) => data.nftAddress && data.minimumBid && data.maximumBid && data.expiryTime, {
      message: "NFT address, minimum bid, maximum bid, and expiry time are required",
      path: ["nftAddress", "minimumBid", "maximumBid", "expiryTime"],
    });
  
  export interface CreateAuctionContent extends Content {
    nftAddress: string;
    minimumBid: string;
    maximumBid: string;
    expiryTime: string;
  }
  
  function isCreateAuctionContent(
    content: Content
  ): content is CreateAuctionContent {
    return (
      typeof content.nftAddress === "string" &&
      typeof content.minimumBid === "string" &&
      typeof content.maximumBid === "string" &&
      typeof content.expiryTime === "string"
    );
  }
  
  const createAuctionTemplate = `Respond with a JSON markdown block containing only the extracted values.
  Example response:
  \`\`\`json
  {
    "nftAddress": "<NFT address for auction>",
    "minimumBid": "<Minimum bid in TON>",
    "maximumBid": "<Maximum bid/buyout price in TON>",
    "expiryTime": "<Auction expiry time in hours>"
  }
  \`\`\`
  
  {{recentMessages}}
  
  Respond with a JSON markdown block containing only the extracted values.`;
  
  /**
   * Helper function to build create auction parameters.
   */
  const buildCreateAuctionData = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<CreateAuctionContent> => {
    const context = composeContext({
      state,
      template: createAuctionTemplate,
    });
    const content = await generateObject({
      runtime,
      context,
      schema: createAuctionSchema as any,
      modelClass: ModelClass.SMALL,
    });
    return content.object as any;
  };
  
  /**
   * CreateAuctionAction encapsulates the logic to create an auction for an NFT.
   */
  export class CreateAuctionAction {
    private walletProvider: WalletProvider;
    constructor(walletProvider: WalletProvider) {
      this.walletProvider = walletProvider;
    }
  
    /**
     * Creates an auction for an NFT using default marketplace configuration
     */
    async createAuction(params: CreateAuctionContent): Promise<any> {
      const client = this.walletProvider.getWalletClient();
      const contract = client.open(this.walletProvider.wallet);
  
      const minimumBid = toNano(params.minimumBid);
      const maximumBid = toNano(params.maximumBid);
      const expiryTime = Math.floor(Date.now() / 1000) + parseInt(params.expiryTime) * 3600; // Convert hours to seconds and add to current timestamp
      const royalty = CONFIG.royaltyPercent;
      const fee = CONFIG.marketplaceFeePercent;
  
      const auctionData = {
        nftAddress: Address.parse(params.nftAddress),
        nftOwnerAddress: this.walletProvider.wallet.address,
        deployerAddress: destinationAddress,
        marketplaceAddress: marketplaceAddress,
        marketplaceFeeAddress: marketplaceFeeAddress,
        marketplaceFeePercent: (maximumBid / BigInt(100)) * BigInt(fee),
        royaltyAddress: this.walletProvider.wallet.address, // Using wallet address as royalty recipient
        royaltyPercent: (maximumBid / BigInt(100)) * BigInt(royalty),
        minimumBid: minimumBid,
        maximumBid: maximumBid,
        expiryTime: expiryTime,
      };
  
      const auctionBody = await buildNftAuctionV3R3Data(auctionData);
  
      const seqno = await contract.getSeqno();
      const auctionMessage = internal({
        to: params.nftAddress,
        value: toNano("0.5"), // Increased value for auction operations
        bounce: true,
        body: auctionBody,
      });
  
      const transfer = await contract.sendTransfer({
        seqno,
        secretKey: this.walletProvider.keypair.secretKey,
        messages: [auctionMessage],
        sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
      });
  
      await waitSeqnoContract(seqno, contract);
  
      return {
        nftAddress: params.nftAddress,
        minimumBid: params.minimumBid,
        maximumBid: params.maximumBid,
        expiryTime: params.expiryTime,
        message: "NFT auction created successfully",
        marketplaceFee: `${fee}%`,
        royaltyFee: `${royalty}%`,
        expiryTimestamp: new Date(Number(expiryTime) * 1000).toISOString(),
      };
    }
  }
  
  export default {
    name: "CREATE_AUCTION",
    similes: ["NFT_AUCTION", "AUCTION_NFT", "START_AUCTION"],
    description:
      "Creates an auction for an NFT by sending the appropriate message to the NFT contract. Requires NFT address, minimum bid, maximum bid (buyout price), and auction expiry time in hours.",
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      options: any,
      callback?: HandlerCallback
    ) => {
      elizaLogger.log("Starting CREATE_AUCTION handler...");
      const params = await buildCreateAuctionData(runtime, message, state);
  
      if (!isCreateAuctionContent(params)) {
        if (callback) {
          callback({
            text: "Unable to process create auction request. Invalid content provided.",
            content: { error: "Invalid create auction content" },
          });
        }
        return false;
      }
  
      try {
        const walletProvider = await initWalletProvider(runtime);
        const createAuctionAction = new CreateAuctionAction(walletProvider);
  
        const result = await createAuctionAction.createAuction(params);
  
        if (callback) {
          callback({
            text: JSON.stringify(result, null, 2),
            content: result,
          });
        }
      } catch (error: any) {
        elizaLogger.error("Error in CREATE_AUCTION handler:", error);
        if (callback) {
          callback({
            text: `Error in CREATE_AUCTION: ${error.message}`,
            content: { error: error.message },
          });
        }
      }
      return true;
    },
    template: createAuctionTemplate,
    // eslint-disable-next-line
    validate: async (_runtime: IAgentRuntime) => {
      return true;
    },
    examples: [
      [
        {
          user: "{{user1}}",
          content: {
            nftAddress: "EQNftAddressExample",
            minimumBid: "5",
            maximumBid: "20",
            expiryTime: "48",
            action: "CREATE_AUCTION",
          },
        },
        {
          user: "{{user1}}",
          content: {
            text: "NFT auction created successfully",
          },
        },
      ],
    ],
  };