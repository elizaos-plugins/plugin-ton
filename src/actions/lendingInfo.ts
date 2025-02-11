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
import { sleep, base64ToHex, formatCurrency } from "../utils/util";
import {
    initWalletProvider,
    type WalletProvider,
    nativeWalletProvider,
} from "../providers/wallet";
import {
    Evaa,
    FEES,
    MAINNET_LP_POOL_CONFIG,
    MAINNET_POOL_CONFIG,
    PricesCollector,
    TESTNET_POOL_CONFIG,
    TON_MAINNET,
    TONUSDT_DEDUST_MAINNET,
} from "@evaafi/sdk";
import { Address, fromNano, internal } from "@ton/ton";

// TODO: add lending protocol name to support multiple lending protocols
export interface LendingInfoContent extends Content {
    userAddress: string;
}

function isLendingInfoContent(content: Content): content is LendingInfoContent {
    console.log("Content for geting lending info", content);
    return typeof content.userAddress === "string";
}

interface ActionOptions {
    [key: string]: unknown;
}

type LendingDataActive = {
    type: "active";
    borrowBalance: string;
    supplyBalance: string;
    availableToBorrow: string;
    debtLimitUsedPercent: string;
    healthFactor: number;
};

type LendingDataInactive = {
    type: "inactive";
};

type LendingData = LendingDataActive | LendingDataInactive;

/**
 * Template guiding the extraction of user data parameters for getting of lending protocol info.
 * The output should be a JSON markdown block similar to:
 *
 * {
 *   "userAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
 * }
 */
const getLendingInfoTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "userAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested lending info:
- User address

Respond with a JSON markdown block containing only the extracted values.`;

function createLendingInfoResponseText(
    lendingInfo: LendingData,
    userAddress: string
) {
    if (lendingInfo.type === "inactive") {
        return `Lending contract for ${userAddress} is inactive, seems like user hasn't interacted with it yet`;
    }

    return `Lending info for user address ${userAddress}
Borrow balance: ${lendingInfo.borrowBalance}$
Supply balance: ${lendingInfo.supplyBalance}$
Available to borrow: ${lendingInfo.availableToBorrow}$
Debt limit already used: ${lendingInfo.debtLimitUsedPercent}%
Health factor (account could be liquidated if < 0): ${lendingInfo.healthFactor}`;
}

export class GetLendingInfoAction {
    private readonly walletProvider: WalletProvider;

    constructor(walletProvider: WalletProvider) {
        this.walletProvider = walletProvider;
    }

    async getLendingInfo(params: LendingInfoContent): Promise<LendingData> {
        // console.log(`Getting lending info for user: ${params.userAddress}`);
        // {  "userAddress": "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4" }

        const walletClient = this.walletProvider.getWalletClient();

        try {
            const evaa = walletClient.open(
                new Evaa({ poolConfig: MAINNET_LP_POOL_CONFIG })
            );

            const userAddress = Address.parse(params.userAddress);

            await evaa.getSync();
            const pricesCollector = new PricesCollector(MAINNET_LP_POOL_CONFIG);
            const priceData = await pricesCollector.getPrices();

            const user = evaa.getOpenedUserContract(userAddress);

            await user.getSync(
                evaa.data!.assetsData,
                evaa.data!.assetsConfig,
                priceData!.dict
            );

            if (user.data.type === "inactive") {
                // return "Lending contract for this user is inactive, seems like he hasn't interacted with it yet";
                return {
                    type: "inactive",
                };
            }

            return {
                type: "active",
                borrowBalance: formatCurrency(
                    fromNano(user.data.borrowBalance),
                    2
                ),
                supplyBalance: formatCurrency(
                    fromNano(user.data.supplyBalance),
                    2
                ),
                availableToBorrow: formatCurrency(
                    fromNano(user.data.availableToBorrow),
                    2
                ),
                debtLimitUsedPercent: formatCurrency(
                    user.data.limitUsedPercent.toString(),
                    2
                ),
                healthFactor: user.data.healthFactor,
            };
        } catch (error: any) {
            elizaLogger.error("Error getting lending info:", error);
            throw error;
        }
    }
}

const buildGetLendingInfo = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<LendingInfoContent> => {
    // Initialize or update state
    let currentState = state;
    if (!currentState) {
        currentState = (await runtime.composeState(message)) as State;
    } else {
        currentState = await runtime.updateRecentMessageState(currentState);
    }

    // Define the schema for the expected output
    const getLendingInfoSchema = z.object({
        userAddress: z.string(),
    });

    // Compose lending info getter context
    const getLendingInfoContext = composeContext({
        state,
        template: getLendingInfoTemplate,
    });

    const content = await generateObject({
        runtime,
        context: getLendingInfoContext,
        schema: getLendingInfoSchema,
        modelClass: ModelClass.SMALL,
    });

    let getLendingInfoContent: LendingInfoContent =
        content.object as LendingInfoContent;

    if (getLendingInfoContent === undefined) {
        getLendingInfoContent = content as unknown as LendingInfoContent;
    }

    return getLendingInfoContent;
};

export default {
    name: "GET_LENDING_INFO",
    similes: ["FETCH_LENDING_DATA", "GET_LENDING_DATA", "SHOW_LENDING_INFO"],
    description:
        "Call this action to get lending info (current borrow/supply rates and liquidation risks) for user address",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: ActionOptions,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting GET_LENDING_INFO handler...");

        const getLendingInfoDetails = await buildGetLendingInfo(
            runtime,
            message,
            state
        );

        // validate model-provided content
        if (!isLendingInfoContent(getLendingInfoDetails)) {
            console.error("Invalid content for GET_LENDING_INFO action.");
            if (callback) {
                callback({
                    text: "Unable to process get lending data request. Invalid content provided.",
                    content: { error: "Invalid transfer content" },
                });
            }
            return false;
        }

        try {
            const walletProvider = await initWalletProvider(runtime);
            const action = new GetLendingInfoAction(walletProvider);
            const lendingInfo = await action.getLendingInfo(
                getLendingInfoDetails
            );

            if (callback) {
                const lendingInfoResponseText = createLendingInfoResponseText(
                    lendingInfo,
                    getLendingInfoDetails.userAddress
                );

                callback({
                    text: lendingInfoResponseText,
                    content: lendingInfo,
                });
            }

            return true;
        } catch (error) {
            console.error("Error during getting lending info:", error);
            if (callback) {
                callback({
                    text: `Error getting lending info: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: getLendingInfoTemplate,
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
                    text: "Show lending info for EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll get lending info now",
                    action: "GET_LENDING_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: `Lending info for user address EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4
Borrow balance: 50$
Supply balance: 10$
Available to borrow: 30.5$
Debt limit already used: 39%
Health factor (account could be liquidated if < 0): 0.32`,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Get lending info for EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Sure, getting lending info for EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N...",
                    action: "GET_LENDING_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: `Lending info for user address EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N
Borrow balance: 102.1$
Supply balance: 70$
Available to borrow: 21.2$
Debt limit already used: 15%
Health factor (account could be liquidated if < 0): 0.72`,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show me lending info in TON blockchain for EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I will get lending info for EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N...",
                    action: "GET_LENDING_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: `Lending info for user address EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N
Borrow balance: 22$
Supply balance: 2112$
Available to borrow: 2932$
Debt limit already used: 53%
Health factor (account could be liquidated if < 0): 0.133`,
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to see lending info for EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Getting lending info for EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N...",
                    action: "GET_LENDING_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Lending contract for EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N is inactive, seems like user hasn't interacted with it yet",
                },
            },
        ],
    ],
};
