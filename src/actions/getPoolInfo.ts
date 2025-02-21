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


export interface PoolInfoContent extends Content {
    poolId: string;
}

function isPoolInfoContent(content: Content): content is PoolInfoContent {
    return typeof content.poolId === "string";
}

const getPoolInfoTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "poolId": string
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the pool identifier (TON address) for which to fetch staking pool information.

Respond with a JSON markdown block containing only the extracted value.`;

export class GetPoolInfoAction {
    constructor(private stakingProvider: IStakingProvider) {}

    async getPoolInfo(params: PoolInfoContent): Promise<any> {
        elizaLogger.log(`Fetching pool info for pool (${params.poolId})`);
        try {
            // Call the staking provider's getPoolInfo method.
            const poolInfo = await this.stakingProvider.getFormattedPoolInfo(
                params.poolId,
            );
            return poolInfo;
        } catch (error) {
            throw new Error(`Fetching pool info failed: ${error.message}`);
        }
    }
}

const buildPoolInfoDetails = async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
): Promise<PoolInfoContent> => {
    if (!state) {
        state = (await runtime.composeState(message)) as State;
    } else {
        state = await runtime.updateRecentMessageState(state);
    }
    const poolInfoSchema = z.object({
        poolId: z.string(),
    });

    const poolInfoContext = composeContext({
        state,
        template: getPoolInfoTemplate,
    });

    const content = await generateObject({
        runtime,
        context: poolInfoContext,
        schema: poolInfoSchema,
        modelClass: ModelClass.SMALL,
    });

    return content.object as PoolInfoContent;
};

export default {
    name: "GET_POOL_INFO",
    similes: ["FETCH_POOL_INFO", "POOL_DATA", "GET_STAKING_INFO"],
    description: "Fetch detailed global staking pool information. Only perform if user is asking for a specific Pool Info, and NOT your stake.",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback?: HandlerCallback,
    ) => {
        elizaLogger.log("Starting GET_POOL_INFO handler...");
        const poolInfoDetails = await buildPoolInfoDetails(
            runtime,
            message,
            state,
        );

        if (!isPoolInfoContent(poolInfoDetails)) {
            elizaLogger.error("Invalid content for GET_POOL_INFO action.");
            if (callback) {
                callback({
                    text: "Invalid pool info details provided.",
                    content: { error: "Invalid pool info content" },
                });
            }
            return false;
        }

        try {
            const stakingProvider = await initStakingProvider(runtime);
            const action = new GetPoolInfoAction(stakingProvider);
            const poolInfo = await action.getPoolInfo(poolInfoDetails);

            if (callback) {
                callback({
                    text: `Successfully fetched pool info: \n${poolInfo}`,
                    content: poolInfo,
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error fetching pool info:", error);
            if (callback) {
                callback({
                    text: `Error fetching pool info: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: getPoolInfoTemplate,
    validate: async (runtime: IAgentRuntime) => true,
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Get info for pool pool123",
                    action: "GET_POOL_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Fetching pool info...",
                    action: "GET_POOL_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: 'Fetched pool info for pool pool123: { "totalStaked": 1000, "rewardRate": 0.05, ...}',
                },
            },
        ],
    ],
};