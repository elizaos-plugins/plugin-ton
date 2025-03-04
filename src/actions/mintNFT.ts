import {
  elizaLogger,
  composeContext,
  generateObject,
  ModelClass,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type Content,
} from "@elizaos/core";
import { z } from "zod";
import { Address, toNano } from "@ton/ton";
import { initWalletProvider, WalletProvider } from "../providers/wallet";

import path from "path";
import { CollectionData, NFTCollection } from "../utils/NFTCollection";
import { topUpBalance, updateMetadataFiles, uploadFolderToIPFS, uploadJSONToIPFS, waitSeqnoContract } from "../utils/util";
import { readdir } from "fs/promises";
import { NftItem } from "../utils/NFTItem";
import { getAddressByIndex } from "../utils/NFTItem";
/**
 * Extended interface for minting content.
 * - nftType: Defines if the NFT is part of a collection ("standalone") or if a new collection should be created ("collection").
 * - collection: For standalone NFTs, a valid NFT collection address must be provided. For new collections, this field can be omitted.
 * - metadata: NFT metadata including storage option and an optional IPFS provider for off-chain storage.
 */
export interface MintContent extends Content {
  nftType: "collection" | "standalone";
  collection?: string;
  owner: string;
  storage: "file" | "prompt";
  imagesFolderPath?: string;
  metadataFolderPath?: string;
  metadata?: {
    name: string;
    description?: string;
    image: string;
    content_url?: string;
    attributes?: any[];
  };
  royaltyPercent?: number;
  royaltyAddress?: string;
}

/**
 * A type guard to verify the MintContent payload.
 */
function isMintContent(content: Content): content is MintContent {
  elizaLogger.log("Validating mint content:", content);
  
  // Basic validation
  if (!content.nftType || !content.storage) {
    elizaLogger.error("Missing required fields: nftType or storage");
    return false;
  }
  
  // Validate nftType
  if (content.nftType !== "collection" && content.nftType !== "standalone") {
    elizaLogger.error(`Invalid nftType: ${content.nftType}`);
    return false;
  }
  
  // Validate collection address for standalone NFTs
  if (content.nftType === "standalone" && !content.collection) {
    elizaLogger.error("Collection address is required for standalone NFTs");
    return false;
  }
  
  // Validate storage type
  if (content.storage !== "file" && content.storage !== "prompt") {
    elizaLogger.error(`Invalid storage type: ${content.storage}`);
    return false;
  }
  
  return true;
}

/**
 * Define the schema for NFT minting.
 * - nftType: "collection" to initialize a new NFT Collection, "standalone" for existing collection NFTs.
 * - collection: Required for standalone NFTs, optional (and ignored) if initializing a new collection.
 * - owner: NFT owner address.
 * - metadata: NFT metadata according to TEP-64.
 *   * storage: Option for metadata storage ("on-chain" or "off-chain").
 *   * ipfsProvider: Optional IPFS provider to use in case of off-chain metadata.
 */
const mintNFTSchema = z
  .object({
    nftType: z.enum(["collection", "standalone"]).default("standalone"),
    collection: z.string().optional().nullable(),
    owner: z.string().nonempty({ message: "Owner address is required" }),
    storage: z.enum(["file", "prompt"]).default("file"),
    imagesFolderPath: z.string().optional().nullable(),
    metadataFolderPath: z.string().optional().nullable(),
    royaltyPercent: z.number().optional().nullable(),
    royaltyAddress: z.string().optional().nullable(),
    metadata: z.object({
      name: z.string().nonempty({ message: "NFT name is required" }),
      description: z.string().optional(),
      image: z.string().nonempty({ message: "Image URL is required" }),
      cover_image: z.string().optional(),
      social_links: z.array(z.string().optional()).optional(),
    }).optional().nullable(),
  })
  .refine((data) => {
    if (data.nftType === "standalone") {
      return data.collection && data.collection.trim() !== "";
    }
    return true;
  }, {
    message: "Collection address is required for standalone NFTs",
    path: ["collection"],
  });

  
/**
 * Template string to guide the AI agent.
 */
const mintNFTTemplate = `Respond with a JSON markdown block containing only the extracted values.
Use null for any values that cannot be determined.

Example response for standalone NFT (belongs to a collection):
\`\`\`json
{
    "nftType": "standalone",
    "collection": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "owner": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "storage": "prompt",
    "metadata": {
        "name": "Rare NFT Artwork",
        "description": "A unique NFT artwork minted on TON",
        "image": "https://example.com/nft-image.png",
        "cover_image": "https://example.com/nft-cover-image.png",
        "social_links": {
            "twitter": "https://x.com/example",
            "telegram": "https://t.me/example",
            "website": "https://example.com"
        }
    }
}
\`\`\`

Example response for collection NFT (new collection):
\`\`\`json
{
    "nftType": "collection",
    "owner": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "storage": "file",
    "imagesFolderPath": "path/to/images",
    "metadataFolderPath": "path/to/metadata",
    "royaltyPercent": 0.05,
    "royaltyAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the required information to mint an NFT:
- NFT type: "collection" or "standalone"
- Collection address: For collection NFTs, the collection address must be provided.
- The owner address.
- Storage option: "file" or "prompt"
- NFT metadata including name, image, optional description for "prompt" storage,
- Images folder path: For "file" storage, the path to the images folder.
- Metadata folder path: For "file" storage, the path to the metadata folder.

Respond with a JSON markdown block containing only the extracted values.`;

/**
 * Builds the mint details by composing the context using the mintNFTTemplate,
 * then generating the desired object using the provided schema.
 */
const buildMintDetails = async (
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
): Promise<MintContent> => {
  // Initialize or update state.
  let currentState = state;
  if (!currentState) {
    currentState = (await runtime.composeState(message)) as State;
  } else {
    currentState = await runtime.updateRecentMessageState(currentState);
  }

  const mintContext = composeContext({
    state: currentState,
    template: mintNFTTemplate,
  });

  try {
    const content = await generateObject({
      runtime,
      context: mintContext,
      schema: mintNFTSchema,
      modelClass: ModelClass.SMALL,
    });

    let mintContent: MintContent = content.object as MintContent;
    if (mintContent === undefined) {
      mintContent = content as unknown as MintContent;
    }
    return mintContent;
  } catch (error) {
    elizaLogger.error("Error generating mint content:", error);
    throw new Error(`Failed to generate mint content: ${error.message}`);
  }
};

/**
 * The MintNFTAction class simulates NFT minting.
 * If nftType is "collection", a new NFT Collection contract is initialized and its address is generated.
 * Then an NFT item is minted. For "standalone", an NFT is minted under the provided collection address.
 * Depending on metadata.storage, the metadata is either stored on-chain or uploaded to IPFS.
 * Finally, a deploy transaction is crafted and sent using the TON SDK.
 */

class MintNFTAction {
  private walletProvider: WalletProvider;

  constructor(walletProvider: WalletProvider) {
    this.walletProvider = walletProvider;
  }

  /**
   * Uploads content to IPFS based on storage type
   */
  private async uploadContent(params: MintContent): Promise<{ metadataIpfsHash: string, imagesIpfsHash?: string }> {
    let metadataIpfsHash: string;
    let imagesIpfsHash: string | undefined;
    
    try {
      if (params.storage === "file") {
        if (!params.imagesFolderPath || !params.metadataFolderPath) {
          throw new Error("Image and metadata folder paths are required for file storage");
        }
        
        elizaLogger.log("Started uploading images to IPFS...");
        imagesIpfsHash = await uploadFolderToIPFS(params.imagesFolderPath);
        elizaLogger.log(
          `Successfully uploaded the pictures to ipfs: https://gateway.pinata.cloud/ipfs/${imagesIpfsHash}`
        );
      
        elizaLogger.log("Started uploading metadata files to IPFS...");
        await updateMetadataFiles(params.metadataFolderPath, imagesIpfsHash);
        metadataIpfsHash = await uploadFolderToIPFS(params.metadataFolderPath);
        elizaLogger.log(
          `Successfully uploaded the metadata to ipfs: https://gateway.pinata.cloud/ipfs/${metadataIpfsHash}`
        );
        return { metadataIpfsHash, imagesIpfsHash };
      } else if(params.storage === "prompt"){
        if(!params.metadata) {
          throw new Error("Metadata is required for prompt storage");
        }
        elizaLogger.log("Uploading metadata JSON to IPFS...");
        metadataIpfsHash = await uploadJSONToIPFS(params.metadata);
        elizaLogger.log(`Successfully uploaded metadata to IPFS: ${metadataIpfsHash}`);
        return { metadataIpfsHash };
      }
      
      throw new Error("Invalid storage type");
    } catch (error) {
      elizaLogger.error("Error uploading content to IPFS:", error);
      throw new Error(`Failed to upload content: ${error.message}`);
    }
  }

  /**
   * Deploys a standalone NFT to an existing collection
   */
  private async deployStandaloneNFT(params: MintContent): Promise<any> {
    if(!params.collection) {
      throw new Error("Collection address is required for standalone NFTs");
    }
    
    try {
      elizaLogger.log(`Reading metadata files from ${params.metadataFolderPath}`);
      const files = await readdir(params.metadataFolderPath as string);
      files.pop(); // Remove collection.json
      let index = 0;
      
      elizaLogger.log(`Found ${files.length} NFT metadata files to deploy`);
      elizaLogger.log("Topping up wallet balance...");
      let seqno = await topUpBalance(this.walletProvider, files.length, params.collection);
      const walletClient = this.walletProvider.getWalletClient();
      const contract = walletClient.open(this.walletProvider.wallet);
      await waitSeqnoContract(seqno, contract);
      
      for (const file of files) {
        elizaLogger.log(`Starting deployment of NFT ${index + 1}/${files.length}`);
        const mintParams = {
          queryId: 0,
          itemOwnerAddress: this.walletProvider.wallet.address,
          itemIndex: index,
          amount: toNano("0.05"),
          commonContentUrl: file,
        };
    
        const nftItem = new NftItem(params.collection);
        seqno = await nftItem.deploy(this.walletProvider, mintParams);
        await waitSeqnoContract(seqno, this.walletProvider.wallet);

        // Get the NFT address using the getAddressByIndex function
        const client = this.walletProvider.getWalletClient();
        const nftAddress = await getAddressByIndex(
          client, 
          Address.parse(params.collection), 
          index
        );
        elizaLogger.log(`Successfully deployed NFT ${index + 1}/${files.length} with address: ${nftAddress}`);

        // Add to deployedNfts array if you want to track them
        index++;
      }
      
    } catch (error) {
      elizaLogger.error("Error deploying standalone NFT:", error);
      throw new Error(`Failed to deploy standalone NFT: ${error.message}`);
    }
  }

  /**
   * Deploys a new NFT collection
   */
  private async deployCollection(params: MintContent, metadataIpfsHash: string): Promise<string> {
    try {
      elizaLogger.log("[TON] Starting deployment of NFT collection...");
      
      // Use default values if not provided
      const royaltyPercent = params.royaltyPercent ?? 5;
      const royaltyAddress = params.royaltyAddress 
        ? Address.parse(params.royaltyAddress) 
        : this.walletProvider.wallet.address;
      
      const collectionData: CollectionData = {
        ownerAddress: this.walletProvider.wallet.address,
        royaltyPercent: royaltyPercent, 
        royaltyAddress: royaltyAddress,
        nextItemIndex: 0,
        collectionContentUrl: `ipfs://${metadataIpfsHash}/collection.json`,
        commonContentUrl: `ipfs://${metadataIpfsHash}/`,
      };
      
      elizaLogger.log("Creating NFT collection with data:", {
        owner: collectionData.ownerAddress.toString(),
        royaltyPercent: collectionData.royaltyPercent,
        royaltyAddress: collectionData.royaltyAddress.toString(),
        collectionContentUrl: collectionData.collectionContentUrl,
      });
      
      const collection = new NFTCollection(collectionData);
      let seqno = await collection.deploy(this.walletProvider);
      elizaLogger.log(`Collection deployment transaction sent, waiting for confirmation...`);

      const walletClient = this.walletProvider.getWalletClient();
      const contract = walletClient.open(this.walletProvider.wallet);
      await waitSeqnoContract(seqno, contract);
      elizaLogger.log(`Collection successfully deployed: ${collection.address}`);
      
      return collection.address.toString();
    } catch (error) {
      elizaLogger.error("Error deploying NFT collection:", error);
      throw new Error(`Failed to deploy NFT collection: ${error.message}`);
    }
  }

  /**
   * Main minting method.
   * If file storage is selected, uploads contents to IPFS and updates metadata.
   * If prompt storage is selected, uploads metadata to IPFS.
   * Then, based on nftType:
   * - For "collection": a new collection address is simulated and the first NFT (index 0) is minted.
   * - For "standalone": uses the provided collection address and queries it to get the next available NFT index.
   */
  async mint(params: MintContent): Promise<string> {
    try {
      elizaLogger.log(`Starting NFT minting process for type: ${params.nftType}`);
      elizaLogger.log(`Using storage type: ${params.storage}`);
      
      const { metadataIpfsHash } = await this.uploadContent(params);
      elizaLogger.log(`Content uploaded to IPFS with hash: ${metadataIpfsHash}`);

      if (params.nftType === "standalone") {
        elizaLogger.log(`Deploying standalone NFT to collection: ${params.collection}`);
        return await this.deployStandaloneNFT(params);
      } else if(params.nftType === "collection"){
        elizaLogger.log("Deploying new NFT collection");
        return await this.deployCollection(params, metadataIpfsHash);
      } else {
        throw new Error(`Invalid NFT type: ${params.nftType}`);
      }
    } catch (error) {
      elizaLogger.error("Error in mint method:", error);
      throw new Error(`Mint operation failed: ${error.message}`);
    }
  }
}

export default {
  name: "MINT_NFT",
  similes: ["NFT_MINT", "MINT_NEW_NFT"],
  description:
    "Mints a new NFT. Can initialize a new NFT Collection (if selected) or mint a standalone NFT. Supports on-chain/off-chain metadata storage with IPFS upload and deploys the NFT contract using the TON SDK.",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    elizaLogger.log("Starting MINT_NFT handler...");
    try {
      // Build mint details using the helper method.
      let mintParams = await buildMintDetails(runtime, message, state);

      elizaLogger.log("Mint parameters extracted:", {
        nftType: mintParams.nftType,
        storage: mintParams.storage,
        collection: mintParams.collection || "N/A",
      });

      // Validate the content using the type guard
      if (!isMintContent(mintParams)) {
        elizaLogger.error("Invalid mint content:", mintParams);
        if (callback) {
          callback({
            text: "Unable to process mint request. Invalid content provided.",
            content: { error: "Invalid mint content" },
          });
        }
        return false;
      }

      // Set default paths if not provided
      mintParams.imagesFolderPath = mintParams.imagesFolderPath || 
        runtime.getSetting("TON_NFT_IMAGES_FOLDER") || 
        path.join(process.cwd(), "ton_nft_images");
      
      mintParams.metadataFolderPath = mintParams.metadataFolderPath || 
        runtime.getSetting("TON_NFT_METADATA_FOLDER") || 
        path.join(process.cwd(), "ton_nft_metadata");

      elizaLogger.log("Using paths:", {
        imagesFolderPath: mintParams.imagesFolderPath,
        metadataFolderPath: mintParams.metadataFolderPath,
      });

      // Mint the NFT.
      const walletProvider = await initWalletProvider(runtime);
      const mintNFTAction = new MintNFTAction(walletProvider);
      const nftAddress = await mintNFTAction.mint(mintParams);

      // Prepare the result.
      const result = {
        status: "success",
        nftAddress,
        collection: mintParams.collection,
        owner: mintParams.owner,
        metadata: mintParams.metadata,
        nftType: mintParams.nftType,
        message: "NFT minted successfully",
      };

      elizaLogger.log("NFT minted successfully:", result);

      if (callback) {
        callback({
          text: `NFT minted successfully. NFT Address: ${nftAddress}`,
          content: result,
        });
      }

      return true;
    } catch (error: any) {
      elizaLogger.error("Error minting NFT:", error);
      if (callback) {
        callback({
          text: `Error minting NFT: ${error.message}`,
          content: { error: error.message },
        });
      }
      return false;
    }
  },
  validate: async (_runtime: IAgentRuntime) => true,
  examples: [
    [
      {
        user: "{{user1}}",
        text: "Mint a new NFT, The metadata is: name: Rare NFT Artwork, description: A unique NFT artwork minted on TON, image: https://example.com/nft-image.png, storage: off-chain, ipfsProvider: ipfs.io",
        content: {
          nftType: "standalone",
          collection: "EQC123CollectionAddress", // required for standalone NFTs
          owner: "EQCOwnerAddress123",
          metadata: {
            name: "Rare NFT Artwork",
            description: "A unique NFT artwork minted on TON",
            image: "https://example.com/nft-image.png",
            storage: "off-chain",
            ipfsProvider: "ipfs.io",
          },
          action: "MINT_NFT",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "NFT minted successfully. NFT Address: NFT_...",
        },
      },
    ],
  ],
  template: mintNFTTemplate,
}; 