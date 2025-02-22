import {
    composeContext,
    Content,
    elizaLogger,
    generateObject,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@elizaos/core";
import {
    initWalletProvider,
    nativeWalletProvider,
    WalletProvider,
} from "../../providers/wallet";
import { base64ToHex, sleep } from "../../utils/util";
import { z } from "zod";
import { SUPPORTED_DEXES } from "../../providers/dexes";

interface ActionOptions {
    [key: string]: unknown;
}

// create new liquidity pools
// handle deposits/withdrawals
//  and manage fees

// TODO
const createPoolTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "dex": "TORCH_FINANCE",
    "tokenA": "TON",
    "tokenB": "stTON",
    "initialLiquidity": "1"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token transfer:
- The name of the DEX the user wants to work with, from the following list: ["TORCH_FINANCE", "RAINBOW_SWAP", "STON_FI", "DEDUST"]
- The name of the first token of the token pair the user wants to create
- The name of the second token of the token pair the user wants to create
- Amount of intial liquidity they want to provide

Respond with a JSON markdown block containing only the extracted values.`;

interface PoolCreatetionContent extends Content {
    dex: (typeof SUPPORTED_DEXES)[number];
    tokenA: string;
    tokenB: string;
    initialLiquidity: string;
}

export class PoolCreationAction {
    private walletProvider: WalletProvider;

    constructor(walletProvider: WalletProvider) {
        this.walletProvider = walletProvider;
    }

    async createPool(params: PoolCreatetionContent): Promise<string> {
        console.log(
            `(${params.dex})Creating: ${params.tokenA}-${params.tokenB} pool w/ (${params.initialLiquidity}) initial liquidity`
        );

        const walletClient = this.walletProvider.getWalletClient();
        const contract = walletClient.open(this.walletProvider.wallet);

        try {
            const seqno: number = await contract.getSeqno();
            await sleep(1500);

            // TODO create pool w/ third-party sdk
            await sleep(1500);

            console.log("Transaction sent, still waiting for confirmation...");
            await sleep(1500);
            //this.waitForTransaction(seqno, contract);
            const state = await walletClient.getContractState(
                this.walletProvider.wallet.address
            );
            const { lt: _, hash: lastHash } = state.lastTransaction;
            return base64ToHex(lastHash);
        } catch (error) {
            throw new Error(`Transfer failed: ${error.message}`);
        }
    }
}

const buildPoolCreationDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<PoolCreatetionContent> => {
    const walletInfo = await nativeWalletProvider.get(runtime, message, state);
    state.walletInfo = walletInfo;

    // Initialize or update state
    let currentState = state;
    if (!currentState) {
        currentState = (await runtime.composeState(message)) as State;
    } else {
        currentState = await runtime.updateRecentMessageState(currentState);
    }

    // Define the schema for the expected output
    const poolCreationSchema = z.object({
        tokenA: z.string(),
        tokenB: z.string(),
        initialLiquidity: z.union([z.string(), z.number()]),
    });

    // Compose transfer context
    const createPoolContext = composeContext({
        state,
        template: createPoolTemplate,
    });

    // Generate transfer content with the schema
    const content = await generateObject({
        runtime,
        context: createPoolContext,
        schema: poolCreationSchema,
        modelClass: ModelClass.SMALL,
    });

    let transferContent: PoolCreatetionContent =
        content.object as PoolCreatetionContent;

    if (transferContent === undefined) {
        transferContent = content as unknown as PoolCreatetionContent;
    }

    return transferContent;
};

function isPoolCreationContent(
    content: Content
): content is PoolCreatetionContent {
    console.log("Content for pool creation", content);
    return (
        typeof content.tokenA === "string" &&
        typeof content.tokenB === "string" &&
        typeof content.initialLiuqidity === "number"
    );
}

export default {
    name: "CREATE_LIQUIDITY_POOL",
    similes: ["CREATE_POOL"],
    description:
        "Create a liquidity pool, given a token pair and initial liquidity",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: ActionOptions,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting SEND_TOKEN handler...");

        const poolCreationDetails = await buildPoolCreationDetails(
            runtime,
            message,
            state
        );

        // Validate transfer content
        if (!isPoolCreationContent(poolCreationDetails)) {
            console.error("Invalid content for TRANSFER_TOKEN action.");
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
            const action = new PoolCreationAction(walletProvider);
            const hash = await action.createPool(poolCreationDetails);

            // if (callback) {
            //     callback({
            //         // TODO wait for transaction to complete
            //         text: `Successfully created pool ${poolCreationDetails.address}, Transaction: ${hash}`,
            //         content: {
            //             success: true,
            //             hash: hash,
            //             amount: poolCreationDetails.amount,
            //             recipient: poolCreationDetails.recipient,
            //         },
            //     });
            // }

            return true;
        } catch (error) {
            console.error("Error during token transfer:", error);
            if (callback) {
                callback({
                    text: `Error transferring tokens: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: createPoolTemplate,
    // eslint-disable-next-line
    validate: async (_runtime: IAgentRuntime) => true,
    examples: [],
};
