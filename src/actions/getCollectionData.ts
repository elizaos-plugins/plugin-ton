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
} from "@ton/ton";
import { z } from "zod";
import { initWalletProvider, type WalletProvider } from "../providers/wallet";

export interface GetCollectionDataContent extends Content {
  collectionAddress: string;
}

function isGetCollectionDataContent(content: Content): content is GetCollectionDataContent {
  return typeof content.collectionAddress === "string";
}

/**
 * Schema for retrieving NFT collection data.
 * - collectionAddress: the NFT collection smart contract address.
 */
const getCollectionDataSchema = z.object({
  collectionAddress: z.string().nonempty("Collection address is required"),
});

/**
 * Template guiding the extraction of collection data parameters.
 */
const getCollectionDataTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
  "collectionAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested NFT collection data:
- Collection address

Respond with a JSON markdown block containing only the extracted values.`;

/**
 * Custom serializer for BigInt values
 */
const safeStringify = (obj: any) => {
  return JSON.stringify(obj, (_, value) => 
    typeof value === 'bigint' ? value.toString() : value
  );
};

/**
 * GetCollectionDataAction encapsulates the core logic to retrieve NFT collection data.
 */
class GetCollectionDataAction {
  private readonly walletProvider: WalletProvider;

  constructor(walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
  }

  /**
   * Retrieves and parses collection data from the provided collection address.
   * Returns an object containing the next NFT index, owner address, royalty info, and NFT items.
   */
  async getData(
    collectionAddress: string,
  ): Promise<{
    collectionAddress: string;
    nextItemIndex: number;
    ownerAddress: string | null;
    royaltyParams: {
      numerator: number;
      denominator: number;
      destination: string;
    } | null;
    nftItems: Array<{ index: number; address: string }>;
    message: string;
  }> {
    const walletClient = this.walletProvider.getWalletClient();
    const addr = Address.parse(collectionAddress);

    try {
      // Get collection data
      elizaLogger.log("Fetching collection data...");
      const collectionDataResult = await walletClient.runMethod(addr, "get_collection_data");
      elizaLogger.log(`Collection data result: ${safeStringify(collectionDataResult)}`);
      
      // Extract the next NFT index and owner address
      const nextItemIndex = collectionDataResult.stack.readNumber();
      
      // Skip the content cell
      collectionDataResult.stack.readCell();
      
      let ownerAddressStr: string | null = null;
      try {
        const ownerAddress = collectionDataResult.stack.readAddress();
        ownerAddressStr = ownerAddress.toString();
      } catch (e) {
        elizaLogger.error("Error reading owner address:", e);
        ownerAddressStr = null;
      }
      
      // Get royalty parameters
      let royaltyParams = null;
      try {
        elizaLogger.log("Fetching royalty parameters...");
        const royaltyResult = await walletClient.runMethod(addr, "royalty_params");
        elizaLogger.log(`Royalty result: ${safeStringify(royaltyResult)}`);
        
        const numerator = royaltyResult.stack.readNumber();
        const denominator = royaltyResult.stack.readNumber();
        const destination = royaltyResult.stack.readAddress().toString();
        
        royaltyParams = {
          numerator,
          denominator,
          destination
        };
      } catch (e) {
        elizaLogger.error("Error fetching royalty parameters:", e);
      }
      
      // Get NFT items by index
      const nftItems = [];
      elizaLogger.log(`Collection has ${nextItemIndex} NFT items. Fetching addresses...`);
      
      for (let i = 0; i < nextItemIndex; i++) {
        try {
          const nftAddressResult = await walletClient.runMethod(addr, "get_nft_address_by_index", [
            { type: "int", value: BigInt(i) }
          ]);
          
          const nftAddress = nftAddressResult.stack.readAddress().toString();
          nftItems.push({
            index: i,
            address: nftAddress
          });
        } catch (e) {
          elizaLogger.error(`Error fetching NFT address for index ${i}:`, e);
        }
      }
  
      return {
        collectionAddress,
        nextItemIndex,
        ownerAddress: ownerAddressStr,
        royaltyParams,
        nftItems,
        message: "Collection data fetched successfully",
      };
    } catch (error: any) {
      elizaLogger.error("Error fetching collection data:", error);
      throw error;
    }
  }
}

/**
 * Helper function that builds collection data details.
 */
const buildGetCollectionData = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State
): Promise<GetCollectionDataContent> => {
  // Initialize or update state
  let currentState = state;
  if (!currentState) {
    currentState = (await runtime.composeState(message)) as State;
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }

  const getCollectionContext = composeContext({
    state: currentState,
    template: getCollectionDataTemplate,
  });
  
  const content = await generateObject({
    runtime,
    context: getCollectionContext,
    schema: getCollectionDataSchema,
    modelClass: ModelClass.SMALL,
  });

  let buildGetCollectionDataContent: GetCollectionDataContent = content.object as GetCollectionDataContent;

  if (buildGetCollectionDataContent === undefined) {
    buildGetCollectionDataContent = content as unknown as GetCollectionDataContent;
  }

  return buildGetCollectionDataContent;
};

export default {
  name: "GET_NFT_COLLECTION_DATA",
  similes: ["GET_COLLECTION_DATA", "FETCH_NFT_COLLECTION"],
  description:
    "Fetches collection data (next NFT index, owner address, royalty parameters, and NFT item addresses) from the provided NFT collection address.",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    elizaLogger.log("Starting GET_NFT_COLLECTION_DATA handler...");
    
    try {
      // Build collection data details using the helper method.
      const getCollectionDetails = await buildGetCollectionData(runtime, message, state);

      if (!isGetCollectionDataContent(getCollectionDetails)) {
        if (callback) {
          callback({
            text: "Unable to process get collection data request. Invalid content provided.",
            content: { error: "Invalid get collection data content" },
          });
        }
        return false;
      }

      const walletProvider = await initWalletProvider(runtime);
      const getCollectionDataAction = new GetCollectionDataAction(walletProvider);
      const collectionData = await getCollectionDataAction.getData(getCollectionDetails.collectionAddress);

      // Format a user-friendly response
      const nftItemsText = collectionData.nftItems.length > 0 
        ? `Contains ${collectionData.nftItems.length} NFT items.` 
        : "No NFT items found in this collection.";
      
      const royaltyText = collectionData.royaltyParams 
        ? `Royalty: ${collectionData.royaltyParams.numerator / collectionData.royaltyParams.denominator * 100}% to ${collectionData.royaltyParams.destination}` 
        : "No royalty information available.";
      
      const ownerText = collectionData.ownerAddress 
        ? `Owner: ${collectionData.ownerAddress}` 
        : "Owner information not available.";

      const responseText = `Collection data fetched successfully.\n${ownerText}\n${royaltyText}\n${nftItemsText}`;

      if (callback) {
        callback({
          text: responseText,
          content: collectionData,
        });
      }
      return true;
    } catch (error: any) {
      elizaLogger.error("Error fetching collection data:", error);
      if (callback) {
        callback({
          text: `Error fetching collection data: ${error.message}`,
          content: { error: error.message },
        });
      }
      return false;
    }
  },
  validate: async (_runtime: IAgentRuntime) => true,
  template: getCollectionDataTemplate,
  examples: [
    [
      {
        user: "{{user1}}",
        text: "Get collection data for collection address {{collectionAddress}}",
        content: {
          collectionAddress: "EQSomeCollectionAddressExample",
          action: "GET_NFT_COLLECTION_DATA",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "Collection data fetched successfully. Owner: EQ..., Royalty: 5% to EQ..., Contains 10 NFT items.",
        },
      },
    ],
  ],
}; 