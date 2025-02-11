import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    type HandlerCallback,
    elizaLogger,
} from "@elizaos/core";
import TonConnect from "@tonconnect/sdk";
import {IStorage, Storg} from "../utils/storage";

export const disconnect: Action = {
    name: "DISCONNECT_TON_WALLET",
    similes: ["DISCONNECT_CONNECTED_TON_WALLET", "REMOVE_TON_CONNECTED"],
    description:
        "Disconnect from ton wallet by address",

    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        const regex = /\b[UV]Q[A-Za-z0-9_-]{46}\b/g;
        return _message.content.text.match(regex)?.[0] ?? false
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        try {
            const manifestUrl = runtime.getSetting("TON_CONNECT_MANIFEST_URL") ?? process.env.TON_CONNECT_MANIFEST_URL ?? null
            if (!manifestUrl) {
                callback({
                    text: `Unable to proceed. Please provide a TON_CONNECT_MANIFEST_URL'`,
                });
                return;
            }

                const storage: IStorage = new Storg(runtime.cacheManager)

            const regex = /\b[UV]Q[A-Za-z0-9_-]{46}\b/g;
            const mentionedAddress = message.content.text.match(regex)?.[0] ?? null;

            if (mentionedAddress) {
                await storage.readFromCache(mentionedAddress)
                const connector = new TonConnect({manifestUrl, storage});
               await connector.restoreConnection()
                if (connector.connected) {
                    await connector.disconnect();
                }
                await storage.deleteFromCache(mentionedAddress);
                callback({text: `Address ${mentionedAddress} successfully disconnected`});
                return
            }

            callback({text: 'Please provide address to disconnect'});

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
                    text: "let disconnect {{ADDRESS}}",
                    action: "DISCONNECT_TON_WALLET",
                },
            }
        ],

    ],
};

export default disconnect;