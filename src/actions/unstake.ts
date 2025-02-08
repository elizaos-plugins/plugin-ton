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
import { initStakingProvider, IStakingProvider } from "../providers/staking";

export interface UnstakeContent extends Content {
    poolId: string;
    amount: string | number;
}

function isUnstakeContent(content: Content): content is UnstakeContent {
    return (
        typeof content.poolId === "string" &&
        (typeof content.amount === "string" ||
            typeof content.amount === "number")
    );
}

const unstakeTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "poolId": "pool123",
    "amount": "1.0"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information for unstaking TON:
- Pool identifier (poolId)
- Amount to unstake

Respond with a JSON markdown block containing only the extracted values.`;

export class UnstakeAction {
    constructor(private stakingProvider: IStakingProvider) {}

    async unstake(params: UnstakeContent): Promise<string> {
        elizaLogger.log(
            `Unstaking: ${params.amount} TON from pool (${params.poolId})`
        );
        try {
            // Call the staking provider's unstake method.
            return await this.stakingProvider.unstake(
                params.poolId,
                Number(params.amount)
            );
        } catch (error) {
            throw new Error(`Unstaking failed: ${error.message}`);
        }
    }
}

const buildUnstakeDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<UnstakeContent> => {
    if (!state) {
        state = (await runtime.composeState(message)) as State;
    } else {
        state = await runtime.updateRecentMessageState(state);
    }
    const unstakeSchema = z.object({
        poolId: z.string(),
        amount: z.union([z.string(), z.number()]),
    });

    const unstakeContext = composeContext({
        state,
        template: unstakeTemplate,
    });

    const content = await generateObject({
        runtime,
        context: unstakeContext,
        schema: unstakeSchema,
        modelClass: ModelClass.SMALL,
    });

    return content.object as UnstakeContent;
};

export default {
    name: "UNSTAKE_TON",
    similes: ["UNSTAKE_TOKENS", "WITHDRAW_TON", "TON_UNSTAKE"],
    description:
        "Unstake TON tokens from a specified pool. {Pay special attention to the request, and make sure the message is not asking to stake.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting UNSTAKE_TON handler...");
        const unstakeDetails = await buildUnstakeDetails(
            runtime,
            message,
            state
        );

        if (!isUnstakeContent(unstakeDetails)) {
            elizaLogger.error("Invalid content for UNSTAKE_TON action.");
            if (callback) {
                callback({
                    text: "Invalid unstake details provided.",
                    content: { error: "Invalid unstake content" },
                });
            }
            return false;
        }

        try {
            const stakingProvider = await initStakingProvider(runtime);
            const action = new UnstakeAction(stakingProvider);
            const txHash = await action.unstake(unstakeDetails);

            if (callback) {
                callback({
                    text: `Successfully unstaked ${unstakeDetails.amount} TON from pool ${unstakeDetails.poolId}. Transaction: ${txHash}`,
                    content: {
                        success: true,
                        hash: txHash,
                        amount: unstakeDetails.amount,
                        poolId: unstakeDetails.poolId,
                    },
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error during unstaking:", error);
            if (callback) {
                callback({
                    text: `Error unstaking TON: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: unstakeTemplate,
    validate: async (runtime: IAgentRuntime) => true,
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Unstake 1 TON from pool pool123",
                    action: "UNSTAKE_TON",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll unstake 1 TON now...",
                    action: "UNSTAKE_TON",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully unstaked 1 TON from pool pool123, Transaction: efgh5678abcd1234",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "withdraw 12 TON from pool eqw237595asd432",
                    action: "UNSTAKE_TON",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Withdrawing 12 TON right now...",
                    action: "UNSTAKE_TON",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully unstaked 12 TON from pool eqw237595asd432, Transaction: efgesdrf234h5678abcd1234",
                },
            },
        ],
    ],
};
