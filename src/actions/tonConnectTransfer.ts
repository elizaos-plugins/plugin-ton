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

export interface TransferContent extends Content {
    recipient: string;
    amount: string | number;
}

function isTransferContent(content: Content): content is TransferContent {
    elizaLogger.log("Content for transfer", content);
    return (
        typeof content.recipient === "string" &&
        (typeof content.amount === "string" ||
            typeof content.amount === "number")
    );
}

const transferTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "recipient": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
    "amount": "1"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token transfer:
- Recipient wallet address
- Amount to transfer

Respond with a JSON markdown block containing only the extracted values.`;

interface ActionOptions {
    [key: string]: unknown;
}

export class TransferAction {
    private tonConnectProvider: TonConnectProvider;

    constructor(tonConnectProvider: TonConnectProvider) {
        this.tonConnectProvider = tonConnectProvider;
    }

    async transfer(params: TransferContent): Promise<string> {
        elizaLogger.log(
            `Transferring: ${params.amount} tokens to (${params.recipient})`,
        );
        // { recipient: 'xx', amount: '0\\.3'}

        const connector = this.tonConnectProvider.connect();

        if (!connector.connected) {
            elizaLogger.error('Please connect wallet to send the transaction!');
        }
        
        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 60, // 60 sec
            messages: [
                {
                    address: params.recipient,
                    amount: params.amount,
                }
            ]
        }
        
        try {
            const result = await connector.sendTransaction(transaction);
            
            // you can use signed boc to find the transaction 
            // const someTxData = await myAppExplorerService.getTransaction(result.boc);
            elizaLogger.log('Transaction was sent successfully.');
        } catch (e) {
            // if (e instanceof UserRejectedError) {
            //     alert('You rejected the transaction. Please confirm it to send to the blockchain');
            // } else {
            //     alert('Unknown error happened', e);
            // }
            elizaLogger.error('Transaction failed.')
        }
    }
}

const buildTransferDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
): Promise<TransferContent> => {
    // const walletInfo = await nativeWalletProvider.get(runtime, message, state);
    // state.walletInfo = walletInfo;

    // Initialize or update state
    let currentState = state;
    if (!currentState) {
        currentState = (await runtime.composeState(message)) as State;
    } else {
        currentState = await runtime.updateRecentMessageState(currentState);
    }

    // Define the schema for the expected output
    const transferSchema = z.object({
        recipient: z.string(),
        amount: z.union([z.string(), z.number()]),
    });

    // Compose transfer context
    const transferContext = composeContext({
        state,
        template: transferTemplate,
    });

    // Generate transfer content with the schema
    const content = await generateObject({
        runtime,
        context: transferContext,
        schema: transferSchema,
        modelClass: ModelClass.SMALL,
    });

    let transferContent: TransferContent = content.object as TransferContent;

    if (transferContent === undefined) {
        transferContent = content as unknown as TransferContent;
    }

    return transferContent;
};

export default {
    name: "SEND_TON_TOKEN_TON_CONNECT",
    similes: ["SEND_TON_TON_CONNECT", "SEND_TON_TOKENS_TON_CONNECT"],
    description:
        "Call this action to send TON tokens to another wallet address. Supports sending any amount of TON to any valid TON wallet address. Transaction will be signed and broadcast to the TON blockchain.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: ActionOptions,
        callback?: HandlerCallback,
    ) => {
        elizaLogger.log("Starting SEND_TOKEN_TON_CONNECT handler...");

        const transferDetails = await buildTransferDetails(
            runtime,
            message,
            state,
        );

        // Validate transfer content
        if (!isTransferContent(transferDetails)) {
            elizaLogger.error("Invalid content for TRANSFER_TOKEN action.");
            if (callback) {
                callback({
                    text: "Unable to process transfer request. Invalid content provided.",
                    content: { error: "Invalid transfer content" },
                });
            }
            return false;
        }

        try {
            // TODO check token balance before transfer
            // const walletProvider = await initWalletProvider(runtime);
            const tonConnectProvider = await initTonConnectProvider(runtime);
            const action = new TransferAction(tonConnectProvider);
            const hash = await action.transfer(transferDetails);

            if (callback) {
                callback({
                    // TODO wait for transaction to complete
                    text: `Successfully transferred ${transferDetails.amount} TON to ${transferDetails.recipient}, Transaction: ${hash}`,
                    content: {
                        success: true,
                        hash: hash,
                        amount: transferDetails.amount,
                        recipient: transferDetails.recipient,
                    },
                });
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error during token transfer:", error);
            if (callback) {
                callback({
                    text: `Error transferring tokens: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: transferTemplate,
    // eslint-disable-next-line
    validate: async (_runtime: IAgentRuntime) => {
        //console.log("Validating TON transfer from user:", message.userId);
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Send 1 TON tokens to EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
                    action: "SEND_TON_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll send 1 TON tokens now...",
                    action: "SEND_TON_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully sent 1 TON tokens to EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4, Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Transfer 0.5 TON to EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
                    action: "SEND_TON_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Processing transfer of 0.5 TON...",
                    action: "SEND_TON_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully sent 0.5 TON to EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N, Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Please move 2.5 TON to EQByzSQE5Mf_UBf5YYVF_fRhP_oZwM_h7mGAymWBjxkY5yVm",
                    action: "SEND_TON_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Initiating transfer of 2.5 TON...",
                    action: "SEND_TON_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully sent 2.5 TON to EQByzSQE5Mf_UBf5YYVF_fRhP_oZwM_h7mGAymWBjxkY5yVm, Transaction: c8ee4a2c1bd070005e6cd31b32270aa461c69b927c3f4c28b293c80786f78b43",
                },
            },
        ],
    ],
};
