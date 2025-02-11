import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    type HandlerCallback,
    elizaLogger,
} from "@elizaos/core";
import {IStorage, Storg} from "../utils/storage";

export const showConnected: Action = {
    name: "SHOW_TON_CONNECTED_WALLETS",
    similes: ["SHOW_CONNECTED_TON_WALLETS", "LIST_TON_WALLETS", "LIST_TON_CONNECTED_WALLETS"],
    description:
        "Use to show all ton connected wallets",

    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        return true
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        try {
            const storage: IStorage = new Storg(runtime.cacheManager)

            const connected = await storage.getCachedAddressList()

            let lines = [
                'Connected wallets:',
                `────────────────`,
            ]

            Object.keys(connected).map((address: string) => {
                lines.push(`- ${address} (${connected[address]})`)
            });

            callback({text: lines.join("\n")});

        } catch (error) {
            elizaLogger.error("Error in show ton connected action: ", error);
            callback({
                text: "An error occurred while make ton connect url. Please try again later.",
                error
            });
            return;
        }
    },

    examples: [
        [
            {
                user: "user",
                content: {
                    text: "show all ton connected addresses",
                    action: "SHOW_TON_CONNECTED_WALLETS",
                },
            }
        ],

    ],
};
export default showConnected;
