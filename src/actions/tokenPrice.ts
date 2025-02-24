import {
  elizaLogger,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  Action,
} from "@elizaos/core";
import { TonTokenPriceProvider } from "../providers/tokenProvider.ts";

export interface PriceContent extends Content {
  token: string;
}

interface ActionOptions {
  [key: string]: unknown;
}

export class TONPriceAction {
  private priceProvider: TonTokenPriceProvider;

  constructor(priceProvider: TonTokenPriceProvider) {
    this.priceProvider = priceProvider;
  }
}

const priceTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "token": "TON"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested token price:
- Token symbol or address

Respond with a JSON markdown block containing only the extracted values.`;

export default {
  name: "GET_TOKEN_PRICE_TON",
  similes: [
    "FETCH_TOKEN_PRICE_TON",
    "CHECK_TOKEN_PRICE_TON",
    "TOKEN_PRICE_TON",
  ],
  description: "Fetches and returns token price information on TON blockchain",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: ActionOptions,
    callback?: HandlerCallback
  ) => {
    console.log("token price action handler started");
    elizaLogger.log("Starting GET_TOKEN_PRICE_TON handler...");

    try {
      const provider = runtime.providers.find(
        (p) => p instanceof TonTokenPriceProvider
      );
      if (!provider) {
        throw new Error("Token price provider not found");
      }
      const priceData = await provider.get(runtime, message, state);
      console.log(priceData);
      //   console.log("callback", callback);
      if (callback) {
        callback({
          text: priceData,
          content: {
            success: true,
            priceData: priceData,
          },
        });
      }

      return true;
    } catch (error) {
      console.error("Error during price fetch:", error);
      if (callback) {
        callback({
          text: `Error fetching token price: ${error.message}`,
          content: { error: error.message },
        });
      }
      return false;
    }
  },
  template: priceTemplate,
  validate: async (
    _runtime: IAgentRuntime,
    message: Memory
  ): Promise<boolean> => {
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content?.text;

    console.log("content", content);
    if (!content) return false;
    //  console.log("inside the token price action");
    const priceKeywords =
      /\b(price|market|status|situation|data|stats|insights|update|check)\b/i;
    const questionWords = /\b(what'?s|how'?s|give|show|tell|check)\b/i;
    const tokenSymbols = /\b(TON|NOT|NOTCOIN|DDST|DEDUST|DOGS|STON)\b/i;

    const hasContext = priceKeywords.test(content);
    const hasQuestion = questionWords.test(content);
    const hasToken = tokenSymbols.test(content);
    console.log(
      "hasContext,",
      hasContext,
      "hasQuestion ",
      hasQuestion,
      hasToken
    );
    // Match if either a direct question about price/market or a general status request
    return hasToken && (hasContext || hasQuestion);
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Hey, could you check TON market data?",
          action: "GET_TOKEN_PRICE_TON",
        },
      },
      {
        user: "{{system}}",
        content: {
          text: "📊 Analyzing TON market data...",
          action: "GET_TOKEN_PRICE_TON",
        },
      },
      {
        user: "{{system}}",
        content: {
          text: "📈 TON Market Update:\n• Current Price: $5.67 (+5.43% 24h)\n• Volume: $1.87B\n• Liquidity: $233M\n• Market Cap: $7.8B",
          metadata: {
            price: 5.67,
            change_24h: 5.43,
            volume_24h: 1870000000,
            liquidity: 233000000,
            market_cap: 7800000000,
          },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "give me a quick update on the notcoin situation",
          action: "GET_TOKEN_PRICE_TON",
        },
      },
      {
        user: "{{system}}",
        content: {
          text: "🔍 Fetching Notcoin stats...",
          action: "GET_TOKEN_PRICE_TON",
        },
      },
      {
        user: "{{system}}",
        content: {
          text: "NOT Token Status:\nPrice: $0.0003 | 24h: +2.19%\nLiquidity Pool: $15M\nDaily Volume: $1M\nMarket Rank: #892",
          metadata: {
            price: 0.0003,
            change_24h: 2.19,
            liquidity: 15000000,
            volume_24h: 1000000,
            rank: 892,
          },
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "what's happening with dedust price?",
          action: "GET_TOKEN_PRICE_TON",
        },
      },
      {
        user: "{{system}}",
        content: {
          text: "⚡ Getting DeDust market insights...",
          action: "GET_TOKEN_PRICE_TON",
        },
      },
      {
        user: "{{system}}",
        content: {
          text: "DeDust (DDST)\nTrading at: $1.23\nTrend: -2.5% (24h)\nVolume: $892K\nPool: $4.2M\nHolder Count: 15.2K",
          metadata: {
            price: 1.23,
            change_24h: -2.5,
            volume_24h: 892000,
            liquidity: 4200000,
            holders: 15200,
          },
        },
      },
    ],
  ],
} as Action;
