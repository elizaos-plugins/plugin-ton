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
import { getListingData } from "../utils/NFTAuction";
  
  /**
   * Schema for buy listing input.
   * Only requires:
   * - nftAddress: The NFT contract address.
   */
  const buyListingSchema = z
    .object({
      nftAddress: z.string().nonempty("NFT address is required"),
    })
    .refine(
      (data) => data.nftAddress,
      {
        message: "NFT address is required",
        path: ["nftAddress"],
      }
    );
  
  export interface BuyListingContent extends Content {
    nftAddress: string;
  }
  
  function isBuyListingContent(
    content: Content
  ): content is BuyListingContent {
    return typeof content.nftAddress === "string";
  }
  
  const buyListingTemplate = `Respond with a JSON markdown block containing only the extracted values.
  Example response:
  \`\`\`json
  {
    "nftAddress": "<NFT address to buy>"
  }
  \`\`\`
  
  {{recentMessages}}
  
  Respond with a JSON markdown block containing only the extracted values.`;
  
  /**
   * Helper function to build buy listing parameters.
   */
  const buildBuyListingData = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
  ): Promise<BuyListingContent> => {
    const context = composeContext({
      state,
      template: buyListingTemplate,
    });
    const content = await generateObject({
      runtime,
      context,
      schema: buyListingSchema as any,
      modelClass: ModelClass.SMALL,
    });
    return content.object as any;
  };
  
  /**
   * BuyListingAction encapsulates the logic to buy an NFT listing.
   */
  export class BuyListingAction {
    private walletProvider: WalletProvider;
    constructor(walletProvider: WalletProvider) {
      this.walletProvider = walletProvider;
    }
  
    /**
     * Buys an NFT listing
     */
    async buy(nftAddress: string): Promise<any> {
      try {
        elizaLogger.log(`Starting purchase of NFT: ${nftAddress}`);
        
        const listingData = await getListingData(this.walletProvider, nftAddress);
        
        // Calculate amount to send (price + gas)
        const gasAmount = toNano("1");  // 1 TON for gas
        const amountToSend = listingData.fullPrice + gasAmount;
        
        elizaLogger.log(`Listing address: ${listingData.listingAddress.toString()}`);
        elizaLogger.log(`Listing price: ${listingData.fullPrice.toString()}`);
        elizaLogger.log(`Amount to send: ${amountToSend.toString()}`);
        
        // Send the transaction to buy
        const client = this.walletProvider.getWalletClient();
        const contract = client.open(this.walletProvider.wallet);
        
        const seqno = await contract.getSeqno();
        const transferMessage = internal({
          to: listingData.listingAddress,
          value: amountToSend,
          bounce: true,
          body: "", // Empty body for default buy operation
        });
        
        const transfer = await contract.sendTransfer({
          seqno,
          secretKey: this.walletProvider.keypair.secretKey,
          messages: [transferMessage],
          sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
        });
        
        await waitSeqnoContract(seqno, contract);
        
        return {
          nftAddress,
          listingAddress: listingData.listingAddress.toString(),
          price: listingData.fullPrice.toString(),
          message: "Buy transaction sent successfully",
        };
      } catch (error) {
        elizaLogger.error(`Error buying NFT ${nftAddress}: ${error}`);
        throw new Error(`Failed to buy NFT: ${error.message}`);
      }
    }
  }
  
  export default {
    name: "BUY_LISTING",
    similes: ["NFT_BUY", "PURCHASE_NFT", "BUY_NFT"],
    description:
      "Buys a listed NFT by sending the required payment to the listing contract.",
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      options: any,
      callback?: HandlerCallback
    ) => {
      elizaLogger.log("Starting BUY_LISTING handler...");
      const params = await buildBuyListingData(runtime, message, state);
  
      if (!isBuyListingContent(params)) {
        if (callback) {
          callback({
            text: "Unable to process buy listing request. Invalid content provided.",
            content: { error: "Invalid buy listing content" },
          });
        }
        return false;
      }
  
      try {
        const walletProvider = await initWalletProvider(runtime);
        const buyListingAction = new BuyListingAction(walletProvider);
        
        const result = await buyListingAction.buy(params.nftAddress);
        
        if (callback) {
          callback({
            text: JSON.stringify(result, null, 2),
            content: result,
          });
        }
      } catch (error: any) {
        elizaLogger.error("Error in BUY_LISTING handler:", error);
        if (callback) {
          callback({
            text: `Error in BUY_LISTING: ${error.message}`,
            content: { error: error.message },
          });
        }
      }
      return true;
    },
    template: buyListingTemplate,
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
            action: "BUY_LISTING",
          },
        },
        {
          user: "{{user1}}",
          content: {
            text: "Buy transaction sent successfully",
          },
        },
      ]
    ],
  };