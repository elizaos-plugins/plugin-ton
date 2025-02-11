import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    type HandlerCallback,
    elizaLogger,
} from "@elizaos/core";
import TonConnect, {
    isWalletInfoCurrentlyEmbedded,
    toUserFriendlyAddress,
    Wallet,
    WalletInfoCurrentlyEmbedded,
    WalletInfoRemote
} from '@tonconnect/sdk';
import QRCode from 'qrcode';
import {IStorage, Storg} from "../utils/storage";

export const tonConnect: Action = {
    name: "TON_CONNECT",
    similes: ["CONNECT_TON_WALLET", "USE_TON_CONNECT"],
    description:
        "Use Ton Connect protocol to connect to your wallet",

    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        return true;
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

            const connector = new TonConnect({manifestUrl, storage});

            // check if user wrote wallet to use for connect
            const wallets = await connector.getWallets();
            const walletNames = wallets.map(wallet => wallet.name.toLowerCase());
            let mentionedWallet = walletNames.find(walletName => message.content.text.toLowerCase().includes(walletName))
            const tonKeeper = wallets.find(wallet => wallet.name.toLowerCase() === 'tonkeeper') as WalletInfoRemote;

            let walletConnectionSources: { universalLink: string, bridgeUrl: string } | { jsBridgeKey: string } = {
                universalLink: tonKeeper.universalLink ?? 'https://app.tonkeeper.com/ton-connect',
                bridgeUrl: tonKeeper.bridgeUrl ?? 'https://bridge.tonapi.io/bridge'
            }
            if (mentionedWallet) {
                const wallet: WalletInfoRemote = wallets.find(wallet => wallet.name.toLowerCase() === mentionedWallet) as WalletInfoRemote;
                walletConnectionSources = {
                    universalLink: wallet.universalLink,
                    bridgeUrl: wallet.bridgeUrl
                }
            } else { // here check embed wallet if not mentioned other
                const embeddedWallet = wallets.find(isWalletInfoCurrentlyEmbedded) as WalletInfoCurrentlyEmbedded;
                mentionedWallet = 'Tonkeeper'
                if (embeddedWallet) {
                    mentionedWallet = embeddedWallet.name
                    walletConnectionSources = {jsBridgeKey: embeddedWallet.jsBridgeKey};
                }
            }

            const universalLink = connector.connect(walletConnectionSources);
            const qrcode = await QRCode.toDataURL(universalLink);
            const text = `You select ${mentionedWallet} to connect. Please open url in browser or scan qrcode to complete connection. ` + universalLink;
            if (qrcode) {
                callback({
                    text,
                    attachments: [
                        {
                            id: crypto.randomUUID(),
                            url: qrcode,
                            title: 'Connection url',
                            source: 'qrcode',
                            contentType: "image/png",
                        }
                    ]
                });
            } else {
                callback({text});
            }

            connector.onStatusChange(
                async (data: Wallet) => {
                    const userFriendlyAddress = toUserFriendlyAddress(data.account.address);
                    await storage.writeToCache(userFriendlyAddress, data.device.appName)
                }
            );

        } catch (error) {
            elizaLogger.error("Error in ton-connect action: ", error);
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
                    text: "let connect to ton wallet",
                    action: "TON_CONNECT",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Please  use following url to connect to your wallet: ",
                },
            },
        ],

    ],
};

export default tonConnect;