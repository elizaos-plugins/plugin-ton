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
import {
  Address,
  internal,
  SendMode,
  toNano,
  Cell,
  beginCell,
} from "@ton/core";
import { z } from "zod";
import { initWalletProvider, WalletProvider } from "../providers/wallet";
import { waitSeqnoContract } from "../utils/util";
import { getListingData } from "../utils/NFTAuction";

/**
 * Schema for cancel listing input.
 * Only requires:
 * - nftAddress: The NFT contract address.
 */
const cancelListingSchema = z
  .object({
    nftAddress: z.string().nonempty("NFT address is required"),
  })
  .refine((data) => data.nftAddress, {
    message: "NFT address is required",
    path: ["nftAddress"],
  });

export interface CancelListingContent extends Content {
  nftAddress: string;
}

function isCancelListingContent(
  content: Content
): content is CancelListingContent {
  return typeof content.nftAddress === "string";
}

const cancelListingTemplate = `Respond with a JSON markdown block containing only the extracted values.
Example response:
\`\`\`json
{
  "nftAddress": "<NFT address to cancel listing>"
}
\`\`\`

{{recentMessages}}

Respond with a JSON markdown block containing only the extracted values.`;

/**
 * Helper function to build cancel listing parameters.
 */
const buildCancelListingData = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State
): Promise<CancelListingContent> => {
  const context = composeContext({
    state,
    template: cancelListingTemplate,
  });
  const content = await generateObject({
    runtime,
    context,
    schema: cancelListingSchema as any,
    modelClass: ModelClass.SMALL,
  });
  return content.object as any;
};

/**
 * CancelListingAction encapsulates the logic to cancel an NFT listing.
 */
export class CancelListingAction {
  private walletProvider: WalletProvider;
  constructor(walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
  }

  /**
   * Cancels an NFT listing
   */
  async cancel(nftAddress: string): Promise<any> {
    try {
      elizaLogger.log(`Starting cancellation of NFT listing: ${nftAddress}`);

      const listingData = await getListingData(this.walletProvider, nftAddress);

      const msgBody = beginCell().storeUint(3, 32).storeUint(0, 64).endCell(); // queryId = 0

      const gasAmount = toNano("0.2"); // 0.2 for cancellation costs

      elizaLogger.log(
        `Listing address: ${listingData.listingAddress.toString()}`
      );

      // Send the transaction to cancel
      const client = this.walletProvider.getWalletClient();
      const contract = client.open(this.walletProvider.wallet);

      const seqno = await contract.getSeqno();
      const transferMessage = internal({
        to: listingData.listingAddress,
        value: gasAmount,
        bounce: true,
        body: msgBody,
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
        message: "Cancel listing transaction sent successfully",
      };
    } catch (error) {
      elizaLogger.error(`Error cancelling NFT listing ${nftAddress}: ${error}`);
      throw new Error(`Failed to cancel NFT listing: ${error.message}`);
    }
  }
}

export default {
  name: "CANCEL_LISTING",
  similes: ["NFT_CANCEL", "CANCEL_NFT", "CANCEL_SALE"],
  description:
    "Cancels a listed NFT by sending a cancel operation to the listing contract.",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log("Starting CANCEL_LISTING handler...");
    const params = await buildCancelListingData(runtime, message, state);

    if (!isCancelListingContent(params)) {
      if (callback) {
        callback({
          text: "Unable to process cancel listing request. Invalid content provided.",
          content: { error: "Invalid cancel listing content" },
        });
      }
      return false;
    }

    try {
      const walletProvider = await initWalletProvider(runtime);
      const cancelListingAction = new CancelListingAction(walletProvider);

      const result = await cancelListingAction.cancel(params.nftAddress);

      if (callback) {
        callback({
          text: JSON.stringify(result, null, 2),
          content: result,
        });
      }
    } catch (error: any) {
      elizaLogger.error("Error in CANCEL_LISTING handler:", error);
      if (callback) {
        callback({
          text: `Error in CANCEL_LISTING: ${error.message}`,
          content: { error: error.message },
        });
      }
    }
    return true;
  },
  template: cancelListingTemplate,
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
          action: "CANCEL_LISTING",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Cancel listing transaction sent successfully",
        },
      },
    ],
  ],
};
