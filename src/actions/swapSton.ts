import {
    elizaLogger,
    composeContext,
    type Content,
    type HandlerCallback,
    ModelClass,
    generateObject,
    type IAgentRuntime,
    type Memory,
    type State,
    ActionExample,
    Action,
    generateText,
} from "@elizaos/core";
import { z } from "zod";
import { sleep } from "../utils/util";
import {
    initWalletProvider,
    nativeWalletProvider,
    type WalletProvider,
} from "../providers/wallet";

import { OpenedContract, toNano, TransactionDescriptionGeneric, fromNano } from "@ton/ton";
import { AssetTag } from '@ston-fi/api';

import { validateEnvConfig } from "../enviroment";
import { StonAsset, initStonProvider, StonProvider } from "../providers/ston";



export interface ISwapContent extends Content {
    tokenIn: string;
    amountIn: string;
    tokenOut: string;
}

function isSwapContent(content: Content): content is ISwapContent {
    return (
        typeof content.tokenIn === "string" &&
        typeof content.tokenOut === "string" &&
        typeof content.amountIn === "string"
    );
}


const swapSchema = z.object({
    tokenIn: z.string().min(1, { message: "First token is required." }),
    amountIn: z.string().min(1, { message: "Amount is required." }),
    tokenOut: z.string().min(1, { message: "Second token is required." }),
});

const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "tokenIn": "TON",
    "amountIn": "1",
    "tokenOut": "USDC"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token transfer:
- Source token
- Amount to transfer
- Destination token

Respond with a JSON markdown block containing only the extracted values.`;



export class SwapAction {
    private walletProvider: WalletProvider;
    private stonProvider: StonProvider;
    private queryId: number;
    private router: OpenedContract<any>;
    private proxyTon: OpenedContract<any>;
    constructor(walletProvider: WalletProvider, stonProvider: StonProvider) {
        this.walletProvider = walletProvider;
        this.stonProvider = stonProvider;
    };


    async waitSwapStatusMainnet() {
        let waitingSteps = 0;
        while (true) {
            await sleep(this.stonProvider.SWAP_WAITING_TIME);

            const swapStatus = await this.stonProvider.client.getSwapStatus({
                routerAddress: this.router.address.toString(),
                ownerAddress: this.walletProvider.wallet.address.toString(),
                queryId: this.queryId.toString(),
            });
            if (swapStatus["@type"] === "Found") {
                if (swapStatus.exitCode === "swap_ok") {
                    return swapStatus;
                } else {
                    throw new Error("Swap failed");
                }
            }

            waitingSteps++;
            if (waitingSteps > this.stonProvider.SWAP_WAITING_STEPS) {
                throw new Error("Swap failed");
            }
        }
    }

    async waitSwapTransaction(originalLt: string, originalHash: string) {

        const client = this.walletProvider.getWalletClient();

        let prevLt = originalLt;
        let prevHash = originalHash;

        let waitingSteps = 0;
        let description;

        while (true) {
            await sleep(this.stonProvider.TX_WAITING_TIME);
            const state = await client.getContractState(this.walletProvider.wallet.address);
            const { lt, hash } = state.lastTransaction ?? { lt: "", hash: "" };
            if (lt !== prevLt && hash !== prevHash) {
                const tx = await client.getTransaction(this.walletProvider.wallet.address, lt, hash);
                description = tx?.description as TransactionDescriptionGeneric;
                if ((description.computePhase?.type === 'vm' && description.actionPhase?.success === true && description.actionPhase?.success)
                    || (description.computePhase?.type !== 'vm' && description.actionPhase?.success)) {
                    return hash;
                } else {
                    prevHash = hash;
                    console.log(`Transaction failed. Waiting for retries...`);
                    waitingSteps = 0;
                }
            }
            waitingSteps += 1;
            if (waitingSteps > this.stonProvider.TX_WAITING_STEPS) {
                if (description?.computePhase?.type === 'vm' && description?.actionPhase?.success === true) {
                    throw new Error("Transaction failed and no more retries received. Compute phase error");
                }
                if (!description?.actionPhase?.valid) {
                    throw new Error("Transaction failed and no more retries received. Invalid transaction");
                }
                if (description?.actionPhase?.noFunds) {
                    throw new Error("Transaction failed and no more retries received. No funds");
                }
                throw new Error("Transaction failed and no more retries received");
            }
        }
    }


    async swap(inAsset: StonAsset, outAsset: StonAsset, amountIn: string) {

        const client = this.walletProvider.getWalletClient();

        const contract = client.open(this.walletProvider.wallet);

        [this.router, this.proxyTon] = this.stonProvider.getRouterAndProxy(client);

        this.queryId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);


        let prevState = await client.getContractState(this.walletProvider.wallet.address);
        let { lt: prevLt, hash: prevHash } = prevState.lastTransaction ?? { lt: "", hash: "" };

        if (inAsset.kind === "Ton" && outAsset.kind === "Jetton") {
            await this.router.sendSwapTonToJetton(
                contract.sender(this.walletProvider.keypair.secretKey),
                {
                    userWalletAddress: this.walletProvider.getAddress(),
                    proxyTon: this.proxyTon,
                    offerAmount: toNano(amountIn),
                    askJettonAddress: outAsset.contractAddress,

                    minAskAmount: "1",
                    queryId: this.queryId,
                }
            );
        } else if (inAsset.kind === "Jetton" && outAsset.kind === "Ton") {
            await this.router.sendSwapJettonToTon(
                contract.sender(this.walletProvider.keypair.secretKey),
                {
                    userWalletAddress: this.walletProvider.getAddress(),
                    offerJettonAddress: inAsset.contractAddress,
                    offerAmount: toNano(amountIn),
                    minAskAmount: "1",
                    proxyTon: this.proxyTon,
                    queryId: this.queryId,
                });
        } else if (inAsset.kind === "Jetton" && outAsset.kind === "Jetton") {
            await this.router.sendSwapJettonToJetton(
                contract.sender(this.walletProvider.keypair.secretKey),
                {
                    userWalletAddress: this.walletProvider.getAddress(),
                    offerJettonAddress: inAsset.contractAddress,
                    offerAmount: toNano(amountIn),
                    askJettonAddress: outAsset.contractAddress,
                    minAskAmount: "1",
                    queryId: this.queryId,
                });
        }

        let txHash, amountOut = "";
        txHash = await this.waitSwapTransaction(prevLt, prevHash);

        if (this.stonProvider.NETWORK === "mainnet") {
            const swapStatus = await this.waitSwapStatusMainnet() as { txHash: string, coins: string };
            txHash = swapStatus.txHash;
            amountOut = swapStatus.coins;
        }

        return { txHash, amountOut };
    }
}

const buildSwapDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
): Promise<ISwapContent> => {

    const walletInfo = await nativeWalletProvider.get(runtime, message, state);
    state.walletInfo = walletInfo;

    let currentState = state;
    if (!currentState) {
        currentState = (await runtime.composeState(message)) as State;
    } else {
        currentState = await runtime.updateRecentMessageState(currentState);
    }

    // Compose swap context
    const swapContext = composeContext({
        state: currentState,
        template: swapTemplate,
    });

    // Generate swap content with the schema
    const content = await generateObject({
        runtime,
        context: swapContext,
        schema: swapSchema,
        modelClass: ModelClass.SMALL,
    });

    let swapContent: ISwapContent = content.object as ISwapContent;

    if (swapContent === undefined) {
        swapContent = content as unknown as ISwapContent;
    }

    return swapContent;
};



export default {
    name: "SWAP_STON",
    similes: ["SWAP_TOKEN_STON", "SWAP_TOKENS_STON", "TOKEN_SWAP_STON", "TRADE_TOKENS_STON", "EXCHANGE_TOKENS_STON"],
    template: swapTemplate,
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.log("Validating config for user:", message.userId);
        await validateEnvConfig(runtime);
        return true;
    },
    description: "Swap tokens in TON blockchain through STON.fi DEX",
    //suppressInitialMessage: true,
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback,
    ) => {
        elizaLogger.log("Starting SWAP handler...");

        elizaLogger.log("Handler initialized. Checking user authorization...");

        // TODO: See how to push response to the interface before finishing the action

        try {
            const swapContent = await buildSwapDetails(
                runtime,
                message,
                state,
            );
            // Validate transfer content
            if (!isSwapContent(swapContent)) {
                throw new Error("Invalid content for SWAP action.");
            }
            const stonProvider = await initStonProvider(runtime);
            // Check if tokens are part of available assets and the pair of tokens is also defined
            const [inTokenAsset, outTokenAsset] = await stonProvider.getAssets(
                swapContent.tokenIn,
                swapContent.tokenOut,
                `(${AssetTag.LiquidityVeryHigh} | ${AssetTag.LiquidityHigh} | ${AssetTag.LiquidityMedium} ) & ${AssetTag.Popular} & ${AssetTag.DefaultSymbol}`
            ) as [StonAsset, StonAsset];
            const walletProvider = await initWalletProvider(runtime);
            const action = new SwapAction(walletProvider, stonProvider);
            // TODO: require confirmation before processing the swap
            const { txHash, amountOut } = await action.swap(inTokenAsset, outTokenAsset, swapContent.amountIn);
            elizaLogger.success(`Successfully swapped ${swapContent.amountIn} ${swapContent.tokenIn} for ${fromNano(amountOut)} ${swapContent.tokenOut}, Transaction: ${txHash}`);

            const template = `
            # Task: generate a dialog line from the character {{agentName}} to communicate {{user1}} that the swap was successful.
            Avoid adding initial and final quotes.
            The dialog line should be only one message and include the following information of the swap : 
            - amountIn ${swapContent.amountIn}
            - amountOut ${fromNano(amountOut)}, only if not zero, if zero indicate that in testnet the swap information is not retrieved
            - tokenIn ${swapContent.tokenIn}
            - tokenOut ${swapContent.tokenOut}
            - hash ${txHash}
            `;
            const responseContext = composeContext({
                state,
                template
            });
            const response = await generateText({
                runtime: runtime,
                context: responseContext,
                modelClass: ModelClass.SMALL,
            });

            callback?.({
                text: response,
                content: {
                    success: true,
                    hash: txHash,
                    amountIn: swapContent.amountIn,
                    amountOut: fromNano(amountOut),
                    tokenIn: swapContent.tokenIn,
                    tokenOut: swapContent.tokenOut,
                },
            });
            return true;
        } catch (error) {
            elizaLogger.error("Error during token swap:", error);

            const template = `
            # Task: generate a dialog line from the character {{agentName}} to communicate {{user1}} that the swap failed due to ${error.message}.
            The dialog line should be only one message and contain al the information of the error.
            Avoid adding initial and final quotes.
            `;

            const responseContext = composeContext({
                state,
                template
            });

            const response = await generateText({
                runtime: runtime,
                context: responseContext,
                modelClass: ModelClass.SMALL,
            });

            await callback?.({
                text: response,
                error: {
                    message: error.message,
                    statusCode: error.response?.status,
                }
            });

            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Swap 1 TON for USDC",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Swapping 1 TON for USDC...",
                    action: "SWAP_TOKEN",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Successfully swapped 1 TON for {{dynamic}} USDC, Transaction: {{dynamic}}",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
