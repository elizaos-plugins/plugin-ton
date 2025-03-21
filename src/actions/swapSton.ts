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
    type ActionExample,
    type Action,
    generateText,
    generateTrueOrFalse,
} from "@elizaos/core";
import { z } from "zod";
import { sleep } from "../utils/util";
import {
    initWalletProvider,
    type WalletProvider,
} from "../providers/wallet";
import { type OpenedContract, 
         toNano, 
         type TransactionDescriptionGeneric, 
         fromNano, 
         internal 
        } from "@ton/ton";
import { AssetTag } from '@ston-fi/api';
import { validateEnvConfig } from "../enviroment";
import { type StonAsset, initStonProvider, type StonProvider } from "../providers/ston";
import { initTonConnectProvider, type TonConnectProvider } from "../providers/tonConnect";
import { CHAIN, type SendTransactionRequest } from "@tonconnect/sdk";

export interface ISwapContent extends Content {
    tokenIn: string;
    amountIn: string;
    tokenOut: string;
}

export interface IPendingSwapContent {
    amountIn: string;
    assetIn: StonAsset;
    assetOut: StonAsset;
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
}).strict();

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


const finishSwapTemplate = `
{{recentMessages}}

Given the recent messages, evaluate if {{user1}} wants to finish a swap that is pending.
Return true if {{user1}} wants to finish the swap, false otherwise.
`;

export class SwapAction {
    private walletProvider: WalletProvider;
    private tonConnectProvider: TonConnectProvider;
    private stonProvider: StonProvider;
    private queryId: number;
    private router: OpenedContract<any>;
    private proxyTon: OpenedContract<any>;
    constructor(walletProvider: WalletProvider, stonProvider: StonProvider, tonConnectProvider: TonConnectProvider) {
        this.walletProvider = walletProvider;
        this.stonProvider = stonProvider;
        this.tonConnectProvider = tonConnectProvider;
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
                } 
                throw new Error("Swap failed");
            }

            waitingSteps++;
            if (waitingSteps > this.stonProvider.SWAP_WAITING_STEPS) {
                throw new Error("Swap failed");
            }
        }
    };

    async waitSwapTransaction(originalLt: string, originalHash: string) {

        const client = this.walletProvider.getWalletClient();

        const prevLt = originalLt;
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
                }
                prevHash = hash;
                console.log("Transaction failed. Waiting for retries...");
                waitingSteps = 0;
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
    };

    async swap(inAsset: StonAsset, outAsset: StonAsset, amountIn: string) {

        const client = this.walletProvider.getWalletClient();

        const contract = client.open(this.walletProvider.wallet);

        [this.router, this.proxyTon] = this.stonProvider.getRouterAndProxy(client);

        this.queryId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

        const prevState = await client.getContractState(this.walletProvider.wallet.address);
        const { lt: prevLt, hash: prevHash } = prevState.lastTransaction ?? { lt: "", hash: "" };

        let txParams;
        let userAddress: string;
        if (this.tonConnectProvider.isConnected()) {
            userAddress = this.tonConnectProvider.getWalletInfo()?.account.address;
        } else {
            userAddress = this.walletProvider.getAddress();
        }
        if (inAsset.kind === "Ton" && outAsset.kind === "Jetton") {
            txParams = await this.router.getSwapTonToJettonTxParams(
                {
                    userWalletAddress: userAddress,
                    proxyTon: this.proxyTon,
                    offerAmount: toNano(amountIn),
                    askJettonAddress: outAsset.contractAddress,
                    minAskAmount: "1",
                    queryId: this.queryId,
                }
            );
        } else if (inAsset.kind === "Jetton" && outAsset.kind === "Ton") {
            txParams = await this.router.getSwapJettonToTonTxParams(
                {
                    userWalletAddress: userAddress,
                    offerJettonAddress: inAsset.contractAddress,
                    offerAmount: toNano(amountIn),
                    minAskAmount: "1",
                    proxyTon: this.proxyTon,
                    queryId: this.queryId,
                });
        } else if (inAsset.kind === "Jetton" && outAsset.kind === "Jetton") {
            txParams = await this.router.getSwapJettonToJettonTxParams(
                {
                    userWalletAddress: userAddress,
                    offerJettonAddress: inAsset.contractAddress,
                    offerAmount: toNano(amountIn),
                    askJettonAddress: outAsset.contractAddress,
                    minAskAmount: "1",
                    queryId: this.queryId,
                });
        }

        let amountOut = "";
        let txHash = "";

        if (this.tonConnectProvider.isConnected()) {
            const transaction: SendTransactionRequest = {
                validUntil: Math.floor(Date.now() / 1000) + 300, // 5 minutes in seconds
                network: this.stonProvider.NETWORK === "mainnet" ? CHAIN.MAINNET : CHAIN.TESTNET,
                messages: [{
                    address: txParams.to?.toString(),
                    amount: txParams.value.toString(),
                    payload: txParams.body?.toBoc().toString("base64")
                }]
            };
            txHash = await this.tonConnectProvider.sendTransaction(transaction);
        } else {
            await contract.sendTransfer({
                seqno: await contract.getSeqno(),
                secretKey: this.walletProvider.keypair.secretKey,
                messages: [internal(txParams)],
              });
            txHash = await this.waitSwapTransaction(prevLt, prevHash);
        }

        if (this.stonProvider.NETWORK === "mainnet") {
            const swapStatus = await this.waitSwapStatusMainnet() as { txHash: string, coins: string };
            txHash = swapStatus.txHash;
            amountOut = swapStatus.coins;
        }

        return { txHash, amountOut };
    };
};

const buildSwapDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
): Promise<ISwapContent> => {

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

const buildFinishSwapDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
): Promise<boolean> => {

    let currentState = state;
    if (!currentState) {
        currentState = (await runtime.composeState(message)) as State;
    } else {
        currentState = await runtime.updateRecentMessageState(currentState);
    }

    // Compose swap context
    const swapIsToBeFinished = composeContext({
        state: currentState,
        template: finishSwapTemplate,
    });

    // Generate swap content with the schema
    return await generateTrueOrFalse({
        runtime,
        context: swapIsToBeFinished,
        modelClass: ModelClass.SMALL,
    });
};

async function handleSwapStart(
        runtime: IAgentRuntime, 
        message: Memory, 
        state: State, 
        callback?: HandlerCallback
    ) {
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

    const template = `
    # Recent messages:
    {{recentMessages}}
    # Task: Write the response from {{agentName}} to communicate that the pending swap was succesfully generated.
    Indicate that the swap is pending and that {{user1}} must finish or cancel it.
    It should be one paragraph and include the following information of the swap : 
    - Input amount ${swapContent.amountIn}
    - Input token ${inTokenAsset.symbol}
    - Output token ${outTokenAsset.symbol}
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
            pendingStonSwap: {
                amountIn: swapContent.amountIn,
                assetIn: inTokenAsset,
                assetOut: outTokenAsset,
            }
        },
    });

    await runtime.cacheManager.set("pendingStonSwap", {
        amountIn: swapContent.amountIn,
        assetIn: inTokenAsset,
        assetOut: outTokenAsset,
    } as IPendingSwapContent);
}

async function handleSwapFinish(
        runtime: IAgentRuntime, 
        message: Memory, 
        state: State, 
        pendingSwap: IPendingSwapContent,
        callback?: HandlerCallback
    ) {

    const finishSwap = await buildFinishSwapDetails(
        runtime,
        message,
        state,
    );

    if (!finishSwap) {
        const template = `
        # Recent messages:
        {{recentMessages}}
        # Task: Write the response from {{agentName}} to communicate that the swap was cancelled as requested.
        It should be one paragraph and include the following information of the swap : 
        - Input amount ${pendingSwap.amountIn}
        - Input token ${pendingSwap.assetIn.symbol}
        - Output token ${pendingSwap.assetOut.symbol}
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
                success: false,
                amountIn: pendingSwap.amountIn,
                tokenIn: pendingSwap.assetIn.symbol,
                tokenOut: pendingSwap.assetOut.symbol,
            },
        });

        await runtime.cacheManager.delete("pendingStonSwap");
        return;
    }
    const stonProvider = await initStonProvider(runtime);
    const walletProvider = await initWalletProvider(runtime);
    const tonConnectProvider = await initTonConnectProvider(runtime);
    const action = new SwapAction(walletProvider, stonProvider, tonConnectProvider);
    const { txHash, amountOut } = await action.swap(pendingSwap.assetIn, pendingSwap.assetOut, pendingSwap.amountIn);
    
    elizaLogger.success(`Successfully swapped ${pendingSwap.amountIn} ${pendingSwap.assetIn.symbol} for ${fromNano(amountOut)} ${pendingSwap.assetOut.symbol}, Transaction: ${txHash}`);
    
    const template = `
    # Recent messages:
    {{recentMessages}}
    # Task: Write the response from {{agentName}} to communicate that the swap was successful.
    It should be one paragraph and include the following information of the swap : 
    - Input amount ${pendingSwap.amountIn}
    - Output amount ${fromNano(amountOut)}, only if not zero, if zero indicate that in testnet the swap information is not retrieved
    - Input token ${pendingSwap.assetIn.symbol}
    - Output token ${pendingSwap.assetOut.symbol}
    - Transaction hash ${txHash}
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
            amountIn: pendingSwap.amountIn,
            amountOut: fromNano(amountOut),
            tokenIn: pendingSwap.assetIn.symbol,
            tokenOut: pendingSwap.assetOut.symbol,
        },
    });

    await runtime.cacheManager.delete("pendingStonSwap");        
}

export const swapStonAction = {
    name: "SWAP_TOKEN_STON",
    similes: ["SWAP_TOKENS_STON"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.log("Validating config for user:", message.userId);
        await validateEnvConfig(runtime);
        return true;
    },
    description: `
        Start a swap of tokens in TON blockchain through STON.fi DEX. 
        Generates a pending swap that must be finished by using FINISH_SWAP_TOKEN_STON action.
    `,
    suppressInitialMessage: true,
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback,
    ) => {
        try {
            elizaLogger.log("Starting SWAP handler...");

            const pendingSwap = await runtime.cacheManager.get("pendingStonSwap");

            if (pendingSwap) {
                throw new Error("Pending swap, finish it before starting a new one");
            } 

            await handleSwapStart(runtime, message, state, callback);
            return true;
    
        } catch (error) {
            elizaLogger.error("Error during token swap:", error);

            const template = `  
            # Recent messages:
            {{recentMessages}}
            # Task: Write the response from {{agentName}} to communicate that there was a problem with the swap due to ${error.message}.
            It should be one paragraph and include the information of the error.
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
                    text: "Are you sure you want to swap 1 TON for USDC...",
                    action: "SWAP_TOKEN_STON",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "Yes, I want to finish the swap",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Ok, I will proceed with the swap...",
                    action: "FINISH_SWAP_TOKENS_STON",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Successfully swapped 1 TON for {{dynamic}} USDC, Transaction: {{dynamic}}",
                },
            },
        ],
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
                    text: "Are you sure you want to swap 1 TON for USDC...",
                    action: "SWAP_TOKEN_STON",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "no, I decided not to do it",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Ok, I will cancel the swap...",
                    action: "FINISH_SWAP_TOKENS_STON",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "The swap has been canceled",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;

export const finishSwapStonAction = {
    name: "FINISH_SWAP_TOKEN_STON",
    similes: ["FINISH_SWAP_TOKENS_STON"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.log("Validating config for user:", message.userId);
        await validateEnvConfig(runtime);
        return true;
    },
    description: `
        Finish a pending swap of tokens in TON blockchain through STON.fi DEX. 
        This must be called immediately after user confirms or cancels the swap.
    `,
    suppressInitialMessage: true,
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback,
    ) => {
        try {
            elizaLogger.log("Starting FINISH SWAP handler...");

            const pendingSwap = await runtime.cacheManager.get("pendingStonSwap");

            if (!pendingSwap) {
                throw new Error("No pending swap, start a new one first");
            } 
            
            await handleSwapFinish(runtime, message, state, pendingSwap as IPendingSwapContent, callback);
            return true;
    
        } catch (error) {
            elizaLogger.error("Error during token swap:", error);

            const template = `
            # Recent messages:
            {{recentMessages}}
            # Task: Write the response from {{agentName}} to communicate that there was a problem with the swap due to ${error.message}.
            It should be one paragraph and include the information of the error.
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
                    text: "Are you sure you want to swap 1 TON for USDC...",
                    action: "SWAP_TOKEN_STON",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "Yes, I want to finish the swap",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Ok, I will proceed with the swap...",
                    action: "SWAP_TOKEN_STON",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Successfully swapped 1 TON for {{dynamic}} USDC, Transaction: {{dynamic}}",
                },
            },
        ],
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
                    text: "Are you sure you want to swap 1 TON for USDC...",
                    action: "SWAP_TOKEN_STON",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "no, I decided not to do it",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Ok, I will cancel the swap...",
                    action: "SWAP_TOKEN_STON",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "The swap has been canceled",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;



export const getPendingStonSwapDetailsAction = {
    name: "GET_PENDING_STON_SWAP_DETAILS",
    similes: [],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.log("Validating config for user:", message.userId);
        await validateEnvConfig(runtime);
        return true;
    },
    description: `
        Get the details of the pending swap of tokens in TON blockchain through STON.fi DEX. 
    `,
    suppressInitialMessage: true,
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback,
    ) => {
        try {
            elizaLogger.log("Starting GET PENDING SWAP DETAILS handler...");

            const pendingSwapCache = await runtime.cacheManager.get("pendingStonSwap");

            let template = ""
            if (!pendingSwapCache) {
                template = `
                # Recent messages:
                {{recentMessages}}
                # Task: Write the response from {{agentName}} to communicate there is no pending swap. 
                It should be one paragraph.
                `;
            } else {
                const pendingSwap = pendingSwapCache as IPendingSwapContent;
                template = `
                # Recent messages:
                {{recentMessages}}
                # Task: Write the response from {{agentName}} to communicate the details of the pending swap.
                It should be one paragraph and include the following information of the swap : 
                - Input amount ${pendingSwap.amountIn}
                - Input token ${pendingSwap.assetIn.symbol}
                - Input token address ${pendingSwap.assetIn.contractAddress}
                - Output token ${pendingSwap.assetOut.symbol}
                - Output token address ${pendingSwap.assetOut.contractAddress}
                `;
            }
            const responseContext = composeContext({
                state,
                template
            });
            const response = await generateText({
                runtime: runtime,
                context: responseContext,
                modelClass: ModelClass.SMALL,
            });
            callback?.({text: response});            
            
            return true;
    
        } catch (error) {
            elizaLogger.error("Error during token swap:", error);

            const template = `
            # Recent messages:
            {{recentMessages}}  
            # Task: Write the response from {{agentName}} to communicate that there was a problem getting the pending swap details due to ${error.message}.
            It should be one paragraph and include the information of the error.
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
                    text: "What are the details of the pending swap?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "The pending swap is 1 TON for USDC",
                    action: "GET_PENDING_SWAP_DETAILS",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
