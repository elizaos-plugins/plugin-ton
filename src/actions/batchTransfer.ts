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
  import { Address, beginCell, internal, JettonMaster, SendMode, toNano } from "@ton/ton";
  import { Builder } from "@ton/ton";
  import { z } from "zod";
  import { initWalletProvider, nativeWalletProvider, WalletProvider } from "../providers/wallet";
  import { base64ToHex, sanitizeTonAddress, sleep, waitSeqnoContract } from "../utils/util";
  
  export interface SingleTransferContent extends Content {
    type: "ton" | "token" | "nft";
    recipientAddress: string;
    amount?: string;
    tokenId?: string;
    jettonMasterAddress?: string;
    metadata?: string;
  }
  
  export interface BatchTransferContent extends Content {
    transfers: SingleTransferContent[];
  }
  
  interface Report {
    type: string;
    recipientAddress: string;
    amount?: string;
    tokenId?: string;
    status: string;
    error?: string;
  }
  
  interface ReportWithMessage {
    report: Report;
    message?: any;
  }
  
  // Schema for each transfer item in the batch.
    const transferItemSchema = z
      .object({
        type: z.enum(["ton", "token", "nft"]),
        recipientAddress: z.string().nonempty("Recipient address is required"),
        amount: z.string().optional(),
        tokenId: z.string().optional(),
        jettonMasterAddress: z.string().optional(),
        metadata: z.string().optional(),
      })
      // TON transfers require an amount.
      .refine((data) => (data.type === "ton" ? !!data.amount : true), {
        message: "Amount is required for TON transfers",
        path: ["amount"],
      })
      // Token transfers require jettonMasterAddress and amount
      .refine((data) => (data.type === "token" ? !!data.jettonMasterAddress : true), {
        message: "jettonMasterAddress is required for token transfers",
        path: ["jettonMasterAddress"],
      })
      .refine((data) => (data.type === "token" ? !!data.amount : true), {
        message: "Amount is required for token transfers",
        path: ["amount"],
      })
      // NFT transfers require a tokenId
      .refine((data) => (data.type === "nft" ? !!data.tokenId : true), {
        message: "tokenId is required for NFT transfers",
        path: ["tokenId"],
      });
  
  // Schema for a batch transfer request.
  const batchTransferSchema = z.object({
    transfers: z.array(transferItemSchema).min(1, "At least one transfer must be provided"),
  });
  
  const batchTransferTemplate = `Respond with a JSON markdown block containing the properties:
  {
    "transfers": [
      {
        "type": "<ton|token|nft>",
        "recipientAddress": "<Recipient's TON address>",
        "amount": "<Transfer amount as string (required for ton and token transfers)>",
        "jettonMasterAddress": "<Jetton master contract address (required for token transfers)>",
        "tokenId": "<NFT item address (required for nft transfers)>",
        "metadata": "<Optional metadata if applicable>"
      }
    ]
  }
  {{recentMessages}}
  
  Don't create multiple objects in the transfers array for the same token.
  Don't create multiple objects in the transfers array for the same NFT.
  
  Extract and output only these values.`;
  
  type TransferItem = z.infer<typeof transferItemSchema>;
  
  function isBatchTransferContent(content: Content): content is BatchTransferContent {
    return (
      Array.isArray(content.transfers) &&
      content.transfers.every((transfer) => transferItemSchema.safeParse(transfer).success)
    );
  }
  
  /**
   * BatchTransferAction encapsulates the core logic for creating a batch transfer which can include
   * TON coins, fungible tokens (e.g., Jettons), and NFTs. Each transfer item is processed individually,
   * and any errors are recorded per item.
   */
  export class BatchTransferAction {
    private walletProvider: WalletProvider;
    constructor(walletProvider: WalletProvider) {
      this.walletProvider = walletProvider;
    }
  
    /**
     * Build a TON transfer message.
     */
    private buildTonTransfer(item: TransferItem): ReportWithMessage{
      const message = internal({
        to: Address.parse(item.recipientAddress),
        value: toNano(item.amount!),
        bounce: true,
        body: "",
      });
      return {
        report: {
          type: item.type,
          recipientAddress: item.recipientAddress,
          amount: item.amount,
          status: "pending",
        },
        message,
      };
    }
  
    /**
     * Build a token transfer message.
     */
    private async buildTokenTransfer(item: TransferItem): Promise<ReportWithMessage> {
      const tokenAddress = Address.parse(item.jettonMasterAddress!);
      const client = this.walletProvider.getWalletClient();
      const jettonMaster = client.open(JettonMaster.create(tokenAddress));
      
      const jettonWalletAddress = await jettonMaster.getWalletAddress(this.walletProvider.wallet.address);
      
      const forwardPayload = beginCell()
        .storeUint(0, 32) // 0 opcode means we have a comment
        .storeStringTail(item.metadata || "Hello, TON!")
        .endCell();
  
      const tokenTransferBody = new Builder()
        .storeUint(0x0f8a7ea5, 32)
        .storeUint(0, 64)
        .storeCoins(toNano(item.amount!))
        .storeAddress(Address.parse(item.recipientAddress))
        .storeAddress(Address.parse(item.recipientAddress))
        .storeBit(0)
        .storeCoins(toNano("0.02"))
        .storeBit(1)
        .storeRef(forwardPayload)
        .endCell();
  
      const message = internal({
        to: jettonWalletAddress,
        value: toNano('0.1'),
        bounce: true,
        body: tokenTransferBody,
      });
  
      const report: ReportWithMessage = {
        report: {
          type: item.type,
          recipientAddress: item.recipientAddress,
          tokenId: item.tokenId,
          amount: item.amount,
          status: "pending",
        },
        message,
    };
      return report;
    }
  
    /**
     * Build an NFT transfer message.
     */
    private buildNftTransfer(item: TransferItem): ReportWithMessage {
      const nftTransferBody = beginCell()
        .storeUint(0x5fcc3d14, 32) // OP transfer
        .storeUint(0, 64) // query_id
        .storeAddress(Address.parse(item.recipientAddress)) // new_owner
        .storeAddress(this.walletProvider.wallet.address) // response_destination (sender's address)
        .storeMaybeRef(null) // custom_payload (null in this case)
        .storeCoins(toNano('0.01')) // forward_amount (0.01 TON for notification)
        .storeMaybeRef(null) // forward_payload (null in this case)
        .endCell();
  
      const message = internal({
        to: Address.parse(item.tokenId!),
        value: toNano('0.05'), // Gas fee for the transfer
        bounce: true,
        body: nftTransferBody,
      });
  
      return {
        message,
        report: {
          type: item.type,
          recipientAddress: item.recipientAddress,
          tokenId: item.tokenId,
          status: "pending",
        },
      };
    }
  
    private async processTransferItem(item: TransferItem): Promise<ReportWithMessage> {
      const recipientAddress = sanitizeTonAddress(item.recipientAddress);
      if (!recipientAddress) {
        throw new Error(`Invalid recipient address: ${item.recipientAddress}`);
      }
      item.recipientAddress = recipientAddress;

      if (item.type === "nft" && item.tokenId) {
        const tokenAddress = sanitizeTonAddress(item.tokenId);
        if (!tokenAddress) {
          throw new Error(`Invalid token address: ${item.tokenId}`);
        }
        item.tokenId = tokenAddress;
      }

      switch (item.type) {
        case "ton":
          return this.buildTonTransfer(item);
        case "token":
          elizaLogger.debug(`Processing token transfer to ${recipientAddress} for token ${item.jettonMasterAddress}`);
          const result = await this.buildTokenTransfer(item);
          elizaLogger.debug(`Token transfer build complete`);
          return result;
        case "nft":
          return this.buildNftTransfer(item);
        default:
          throw new Error(`Unsupported transfer type: ${item.type}`);
      }
    }

    private async executeTransfer(messages: any[], transferReports: Report[]): Promise<string | null> {
      try {
        const walletClient = this.walletProvider.getWalletClient();
        const contract = walletClient.open(this.walletProvider.wallet);

        const seqno: number = await contract.getSeqno();
        await sleep(1500);

        const transfer = await contract.createTransfer({
          seqno,
          secretKey: this.walletProvider.keypair.secretKey,
          messages,
          sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
        });

        await sleep(1500);
        await contract.send(transfer);

        await waitSeqnoContract(seqno, contract);
        const state = await walletClient.getContractState(this.walletProvider.wallet.address);
        const { hash: lastHash } = state.lastTransaction;
        const txHash = base64ToHex(lastHash);

        elizaLogger.log(JSON.stringify(transfer));

        // Update reports for successfully processed transfers
        transferReports.forEach(report => {
          if (report.status === "pending") {
            report.status = "success";
          }
        });

        return txHash;
      } catch (error: any) {
        // Mark any pending transfers as failures
        transferReports.forEach(report => {
          if (report.status === "pending") {
            report.status = "failure";
            report.error = error.message;
          }
        });
        console.error(JSON.stringify(error));
        elizaLogger.error("Error during batch transfer:", JSON.stringify(error));
        return null;
      }
    }

    /**
     * Creates a batch transfer based on an array of transfer items.
     * Each item is processed with a try/catch inside the for loop to ensure that individual errors
     * do not abort the entire batch.
     *
     * @param params - The batch transfer input parameters.
     * @returns An object with a detailed report for each transfer.
     */
    async createBatchTransfer(params: BatchTransferContent): Promise<{hash?: string; reports: Report[]}> {
      const processResults = await Promise.all(
        params.transfers.map(async (item) => {
          try {
            elizaLogger.debug(`Processing transfer item of type ${item.type}`);
            const result = await this.processTransferItem(item);
            return {
              success: true,
              message: result.message,
              report: result.report
            };
          } catch (error: any) {
            elizaLogger.error(`Error processing transfer: ${error.message}`);
            return {
              success: false,
              message: null,
              report: {
                type: item.type,
                recipientAddress: item.recipientAddress,
                amount: item.amount,
                tokenId: item.tokenId,
                status: "failure",
                error: error.message,
              }
            };
          }
        })
      );

      const transferReports: Report[] = [];
      const messages: any[] = [];

      processResults.forEach(result => {
        if (result.success && result.message) {
          messages.push(result.message);
        }
        transferReports.push(result.report);
      });

      const hash = await this.executeTransfer(messages, transferReports);
      return { hash, reports: transferReports };
    }
  }
  
  
  const buildBatchTransferDetails = async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
  ): Promise<BatchTransferContent> => {
      const walletInfo = await nativeWalletProvider.get(runtime, message, state);
      state.walletInfo = walletInfo;
  
      // Initialize or update state
      let currentState = state;
      if (!currentState) {
          currentState = (await runtime.composeState(message)) as State;
      } else {
          currentState = await runtime.updateRecentMessageState(currentState);
      }
  
  
      // Compose transfer context
      const batchTransferContext = composeContext({
          state,
          template: batchTransferTemplate,
      });
  
      // Generate transfer content with the schema
      const content = await generateObject({
          runtime,
          context: batchTransferContext,
          schema: batchTransferSchema as any,
          modelClass: ModelClass.SMALL,
      });
  
      let batchTransferContent: BatchTransferContent = content.object as BatchTransferContent;
  
      if (batchTransferContent === undefined) {
          batchTransferContent = content as unknown as BatchTransferContent;
      }
  
      return batchTransferContent;
  };
  
  export default {
    name: "BATCH_TRANSFER",
    similes: ["BATCH_ASSET_TRANSFER", "MULTI_ASSET_TRANSFER"],
    description:
      "Creates a unified batch transfer for TON coins, tokens (e.g., Jettons), and NFTs. " +
      "Supports flexible input parameters including recipient addresses, amounts, token identifiers, and optional metadata. " +
      "Returns a detailed report summarizing the outcome for each transfer.",
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      options: any,
      callback?: HandlerCallback
    ) => {
      elizaLogger.log("Starting BATCH_TRANSFER handler...");
  
      const details = await buildBatchTransferDetails(runtime, message, state);
      console.log(details);
      if(!isBatchTransferContent(details)) {
          console.error("Invalid content for BATCH_TRANSFER action.");
          if (callback) {
              callback({
                  text: "Unable to process transfer request. Invalid content provided.",
                  content: { error: "Invalid transfer content" },
              });
          }
          return false;
      }
      try {
  
        const walletProvider = await initWalletProvider(runtime);
        const batchTransferAction = new BatchTransferAction(walletProvider);
        const res = await batchTransferAction.createBatchTransfer(details);
        let text = "";
  
        const reports: Report[] = res.reports;
        if(!res.hash) {
          // for each failed result i want to describe the error in the final message
          const erroredReports = reports.filter((report: Report) => report.error);
          erroredReports.forEach((report: Report) => {
            text += `Error in transfer to ${report.recipientAddress}: ${report.error}\n\n`;
          });
        }
  
        if(text === "") {
          text = "Batch transfer processed successfully";
        }
  
        if (callback) {
          callback({
            text: text,
            content: reports,
          });
        }
      } catch (error: any) {
        elizaLogger.error("Error in BATCH_TRANSFER handler:", error);
        if (callback) {
          callback({
            text: `Error in BATCH_TRANSFER: ${error.message}`,
            content: { error: error.message },
          });
        }
      }
      return true;
    },
    template: batchTransferTemplate,
    validate: async (_runtime: IAgentRuntime) => true,
    examples: [
      [
        {
          user: "{{user1}}",
          content: {
            text: "Transfer 1 TON to 0QBLy_5Fr6f8NSpMt8SmPGiItnUE0JxgTJZ6m6E8aXoLtJHB and 1 SCALE token to 0QBLy_5Fr6f8NSpMt8SmPGiItnUE0JxgTJZ6m6E8aXoLtJHB",
            action: "BATCH_TRANSFER"
          }
        },
        {
          user: "{{user1}}",
          content: {
            text: "Batch transfer processed successfully",
          },
        },
      ],
    ],
  }; 