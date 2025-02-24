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
import { Builder } from "@ton/ton";
import { z } from "zod";
import { initWalletProvider, WalletProvider } from "../providers/wallet";
import { waitSeqnoContract } from "../utils/util";

/**
 * Schema for auction interaction input.
 *
 * - auctionAddress: The auction contract address.
 * - auctionAction: One of "getAuctionData", "bid", "stop" or "cancel".
 * - bidAmount: For a bid action, the bid value (e.g., "2" for 2 TON) as a string.
 * - senderAddress: For actions that send an internal message (bid, stop, cancel); represents the caller's address.
 */
const auctionInteractionSchema = z
  .object({
    auctionAddress: z.string().nonempty("Auction address is required"),
    auctionAction: z.enum(["getAuctionData", "bid", "stop", "cancel"]),
    bidAmount: z.string().optional(),
    senderAddress: z.string().optional(),
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
      (data.auctionAction === "stop" || data.auctionAction === "cancel") === false ||
      (!!data.senderAddress),
    {
      message: "For stop or cancel actions, senderAddress is required",
      path: ["senderAddress"],
    }
  );

  export interface AuctionInteractionContent extends Content {
    auctionAddress: string;
    auctionAction: "getAuctionData" | "bid" | "stop" | "cancel";
    bidAmount?: string;
    senderAddress?: string;
  }
  
  function isAuctionInteractionContent(content: Content): content is AuctionInteractionContent {
    return typeof content.auctionAddress === "string" && typeof content.auctionAction === "string";
  }
  

const auctionInteractionTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
Example response:
\`\`\`json
{
  "auctionAddress": "<Auction contract address>",
  "auctionAction": "<getAuctionData|bid|stop|cancel>",
  "bidAmount": "<Bid amount in TON, required for 'bid' action>",
  "senderAddress": "<Sender's TON address, required for actions other than 'getAuctionData'>"
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
      body: ""
    });

    const contract = this.walletProvider.getWalletClient().open(this.walletProvider.wallet);

    const seqno = await contract.getSeqno();
    // Send message using the TON client.
    const transfer = await contract.createTransfer({
            seqno,
            secretKey: this.walletProvider.keypair.secretKey,
            messages: [bidMessage],
            sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
        }
    );

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
    const stopBody = new Builder().storeUint(0, 32).storeBuffer(Buffer.from('stop')).endCell();
    const stopMessage = internal({
      to: auctionAddr,
      value: toNano("0.05"),
      bounce: true,
      body: stopBody
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
    const cancelBody = new Builder().storeUint(0, 32).storeBuffer(Buffer.from('cancel')).endCell();
    const seqno = await contract.getSeqno();
    const cancelMessage = internal({
      to: auctionAddr,
      value: toNano("0.05"),
      bounce: true,
      body: cancelBody
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
    callback?: HandlerCallback,
  ) => {
    elizaLogger.log("Starting INTERACT_AUCTION handler...");
    const params = await buildAuctionInteractionData(runtime, message, state);

    if(!isAuctionInteractionContent(params)) {
      if(callback) {
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
          result = await auctionAction.stop(
            params.auctionAddress
          );
          break;
        case "cancel":
          result = await auctionAction.cancel(
            params.auctionAddress
          );
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
  ],
}; 