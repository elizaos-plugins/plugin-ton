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
} from "@elizaos/core";
import { z } from "zod";
import {
    initTonConnectProvider,
    TonConnectProvider,
} from "../providers/tonConnect";
import {
    CHAIN,
    SendTransactionRequest,
    UserRejectsError,
} from "@tonconnect/sdk";

export interface TonConnectSendTransactionContent extends Content {
    validUntil?: number;
    network?: CHAIN;
    from?: string;
    messages: {
        address: string;
        amount: string;
        stateInit?: string;
        payload?: string;
    }[];
}

function isTonConnectSendTransactionContent(
    content: Content
): content is TonConnectSendTransactionContent {
    console.log("Content for TonConnect transaction", content);
    if (!content.messages || !Array.isArray(content.messages)) {
        return false;
    }

    return content.messages.every(
        (message) =>
            typeof message.address === "string" &&
            typeof message.amount === "string"
    );
}

const tonConnectSendTransactionTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "validUntil": 1234567890,
    "network": "MAINNET",
    "from": "0:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "messages": [
        {
            "address": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
            "amount": "1000000000",
            "stateInit": "te6cckEBAQEAAgAAAEysuc0=",
            "payload": "te6cckEBAQEAAgAAAEysuc0="
        },
        {
            "address": "EQDmnxDMhId6v1Ofg_h5KR5coWlFG6e86Ro3pc7Tq4CA0-Jn",
            "amount": "2000000000",
            "stateInit": null,
            "payload": null
        }
    ]
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested transaction:
- List of messages with recipient addresses and amounts
- Convert all amounts to nanotons (1 TON = 1,000,000,000 nanotons)
- Optional stateInit (base64 encoded contract code)
- Optional payload (base64 encoded message body)
- Optional network specification (MAINNET or TESTNET)
- Optional from address
- Optional validUntil timestamp (in unix seconds)

Respond with a JSON markdown block containing only the extracted values.`;

export class TonConnectSendTransactionAction {
    async sendTransaction(
        params: TonConnectSendTransactionContent,
        provider: TonConnectProvider
    ): Promise<string> {
        console.log(`Sending transaction via TonConnect`);

        if (!provider.isConnected()) {
            throw new Error("Please connect wallet to send the transaction!");
        }

        const transaction: SendTransactionRequest = {
            validUntil: params.validUntil || Math.floor(Date.now() / 1000) + 60,
            network: params.network,
            from: params.from,
            messages: params.messages,
        };

        try {
            const result = await provider.sendTransaction(transaction);
            console.log("Transaction sent successfully");
            return result.boc;
        } catch (error) {
            if (error instanceof UserRejectsError) {
                throw new Error(
                    "You rejected the transaction. Please confirm it to send to the blockchain"
                );
            }
            throw new Error(`Unknown error happened: ${error.message}`);
        }
    }
}

const buildTonConnectSendTransactionDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<TonConnectSendTransactionContent> => {
    let currentState = state;
    if (!currentState) {
        currentState = (await runtime.composeState(message)) as State;
    } else {
        currentState = await runtime.updateRecentMessageState(currentState);
    }

    const transactionSchema = z.object({
        validUntil: z.number().optional(),
        network: z.enum(["MAINNET", "TESTNET"]).optional(),
        from: z.string().optional(),
        messages: z.array(
            z.object({
                address: z.string(),
                amount: z.string(),
                stateInit: z.string().optional(),
                payload: z.string().optional(),
            })
        ),
    });

    const transactionContext = composeContext({
        state,
        template: tonConnectSendTransactionTemplate,
    });

    const content = await generateObject({
        runtime,
        context: transactionContext,
        schema: transactionSchema,
        modelClass: ModelClass.SMALL,
    });

    return content.object as TonConnectSendTransactionContent;
};

export default {
    name: "SEND_TRANSACTION_TONCONNECT",
    similes: ["SEND_TX_TONCONNECT", "SEND_TRANSACTION_TC"],
    description: "Send any transaction using TonConnect wallet integration.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: Record<string, unknown>,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting SEND_TRANSACTION_TONCONNECT handler...");

        // exit if TONCONNECT is not used
        if (!runtime.getSetting('TON_MANIFEST_URL')) {
            return false
        }

        try {
            const provider = await initTonConnectProvider(runtime);

            if (!provider.isConnected()) {
                if (callback) {
                    callback({
                        text: "Please connect your wallet first using the TON_CONNECT action.",
                        content: { error: "Wallet not connected" },
                    });
                }
                return false;
            }

            const transactionDetails =
                await buildTonConnectSendTransactionDetails(
                    runtime,
                    message,
                    state
                );

            if (!isTonConnectSendTransactionContent(transactionDetails)) {
                console.error(
                    "Invalid content for SEND_TRANSACTION_TONCONNECT action."
                );
                if (callback) {
                    callback({
                        text: "Unable to process transaction request. Invalid content provided.",
                        content: { error: "Invalid transaction content" },
                    });
                }
                return false;
            }

            const action = new TonConnectSendTransactionAction();
            const boc = await action.sendTransaction(
                transactionDetails,
                provider
            );

            if (callback) {
                callback({
                    text: `Successfully sent transaction. Transaction: ${boc}`,
                    content: {
                        success: true,
                        boc: boc,
                        transaction: transactionDetails,
                    },
                });
            }

            return true;
        } catch (error) {
            console.error("Error during transaction:", error);
            if (callback) {
                callback({
                    text: `Error sending transaction: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: tonConnectSendTransactionTemplate,
    validate: async (_runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Send 1 TON to EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4 with payload te6cckEBAQEAAgAAAEysuc0=",
                    action: "SEND_TRANSACTION_TONCONNECT",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Processing transaction via TonConnect...",
                    action: "SEND_TRANSACTION_TONCONNECT",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully sent transaction. Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43",
                },
            },
        ],
    ],
};
