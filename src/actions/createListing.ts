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
import { Address, internal, SendMode, toNano } from "@ton/ton";
import { z } from "zod";
import { initWalletProvider, WalletProvider } from "../providers/wallet";
import { waitSeqnoContract } from "../utils/util";
import {
  buildNftFixPriceSaleV3R3DeploymentBody,
  destinationAddress,
  marketplaceAddress,
  marketplaceFeeAddress,
} from "../services/nft-marketplace/listingFactory";

// Configuration constants
const CONFIG = {
  royaltyPercent: 5,
  marketplaceFeePercent: 5,
};

/**
 * Schema for create listing input.
 * Only requires:
 * - nftAddress: The NFT contract address.
 * - fullPrice: The full price of the NFT in TON.
 */
const createListingSchema = z
  .object({
    nftAddress: z.string().nonempty("NFT address is required"),
    fullPrice: z.string().nonempty("Full price is required"),
  })
  .refine((data) => data.nftAddress && data.fullPrice, {
    message: "NFT address and full price are required",
    path: ["nftAddress", "fullPrice"],
  });

export interface CreateListingContent extends Content {
  nftAddress: string;
  fullPrice: string;
}

function isCreateListingContent(
  content: Content
): content is CreateListingContent {
  return (
    typeof content.nftAddress === "string" &&
    typeof content.fullPrice === "string"
  );
}

const createListingTemplate = `Respond with a JSON markdown block containing only the extracted values.
Example response:
\`\`\`json
{
  "nftAddress": "<NFT address for listing>",
  "fullPrice": "<Full price in TON>"
}
\`\`\`

{{recentMessages}}

Respond with a JSON markdown block containing only the extracted values.`;

/**
 * Helper function to build create listing parameters.
 */
const buildCreateListingData = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State
): Promise<CreateListingContent> => {
  const context = composeContext({
    state,
    template: createListingTemplate,
  });
  const content = await generateObject({
    runtime,
    context,
    schema: createListingSchema as any,
    modelClass: ModelClass.SMALL,
  });
  return content.object as any;
};

/**
 * CreateListingAction encapsulates the logic to list an NFT for sale.
 */
export class CreateListingAction {
  private walletProvider: WalletProvider;
  constructor(walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
  }

  /**
   * Lists an NFT for sale using default marketplace configuration
   */
  async list(params: CreateListingContent): Promise<any> {
    const client = this.walletProvider.getWalletClient();
    const contract = client.open(this.walletProvider.wallet);

    const fullPrice = toNano(params.fullPrice);
    const royalty = CONFIG.royaltyPercent;
    const fee = CONFIG.marketplaceFeePercent;

    const saleData = {
      nftAddress: Address.parse(params.nftAddress),
      nftOwnerAddress: this.walletProvider.wallet.address,
      deployerAddress: destinationAddress,
      marketplaceAddress: marketplaceAddress,
      marketplaceFeeAddress: marketplaceFeeAddress,
      marketplaceFeePercent: (fullPrice / BigInt(100)) * BigInt(fee),
      royaltyAddress: this.walletProvider.wallet.address, // Using wallet address as royalty recipient
      royaltyPercent: (fullPrice / BigInt(100)) * BigInt(royalty),
      fullTonPrice: fullPrice,
    };

    const saleBody = await buildNftFixPriceSaleV3R3DeploymentBody(saleData);

    const seqno = await contract.getSeqno();
    const listMessage = internal({
      to: params.nftAddress,
      value: toNano("0.3"), // Sufficient value for all operations
      bounce: true,
      body: saleBody,
    });

    const transfer = await contract.sendTransfer({
      seqno,
      secretKey: this.walletProvider.keypair.secretKey,
      messages: [listMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await waitSeqnoContract(seqno, contract);

    return {
      nftAddress: params.nftAddress,
      fullPrice: params.fullPrice,
      message: "NFT listed for sale successfully",
      marketplaceFee: `${fee}%`,
      royaltyFee: `${royalty}%`,
    };
  }
}

export default {
  name: "CREATE_LISTING",
  similes: ["NFT_LISTING", "LIST_NFT", "SELL_NFT"],
  description:
    "Creates a listing for an NFT by sending the appropriate message to the NFT contract. Only requires NFT address and price.",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log("Starting CREATE_LISTING handler...");
    const params = await buildCreateListingData(runtime, message, state);

    if (!isCreateListingContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process create listing request. Invalid content provided.",
          content: { error: "Invalid create listing content" },
        });
      }
      return false;
    }

    try {
      const walletProvider = await initWalletProvider(runtime);
      const createListingAction = new CreateListingAction(walletProvider);

      const result = await createListingAction.list(params);

      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result,
        });
      }
    } catch (error: any) {
      elizaLogger.error("Error in CREATE_LISTING handler:", error);
      if (callback) {
        callback({
          text: `Error in CREATE_LISTING: ${error.message}`,
          content: { error: error.message },
        });
      }
    }
    return true;
  },
  template: createListingTemplate,
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
          fullPrice: "10",
          action: "CREATE_LISTING",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT listed for sale successfully",
        },
      },
    ],
  ],
};
