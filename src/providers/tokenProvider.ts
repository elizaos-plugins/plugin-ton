import type {
  Provider,
  IAgentRuntime,
  Memory,
  State,
  Content,
} from "@elizaos/core";

import { gunzip } from "zlib";
import { promisify } from "util";

import { DexScreenerResponse, TonApiRateResponse } from "../types.ts";

const gunzipAsync = promisify(gunzip);

export interface PriceContent extends Content {
  token: string;
}

export class TonTokenPriceProvider implements Provider {
  private tokenCache: Map<string, string> = new Map(); // Symbol/Name -> Address
  private poolCache: Map<string, string> = new Map(); // Pair Symbol -> Pool Address
  private cacheTimestamp = 0;
  private readonly CACHE_TTL = 300_000; // 5 minutes
  private readonly TONAPI_ENDPOINT = "https://tonapi.io/v2";
  private readonly DEDUST_API_ENDPOINT = "https://api.dedust.io/v1/pools";
  private readonly DEXSCREENER_API_ENDPOINT =
    "https://api.dexscreener.com/latest/dex/pairs/ton";

  constructor() {
    this.initializeTokenCache();
    this.initializePoolCache();
  }

  private async initializeTokenCache(): Promise<void> {
    try {
      const response = await fetch("https://api.dedust.io/v2/assets");
      const tokens = await response.json();

      // Build symbol/name -> address mapping
      tokens.forEach((token: any) => {
        this.tokenCache.set(token.symbol.toLowerCase(), token.address || "TON");
        this.tokenCache.set(token.name.toLowerCase(), token.address || "TON");
      });

      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error("Failed to initialize token cache:", error);
    }
  }

  private async initializePoolCache(): Promise<void> {
    try {
      const response = await fetch(this.DEDUST_API_ENDPOINT);
      const pools = await response.json();

      // Build pair symbol -> pool address mapping
      pools.forEach((pool: any) => {
        const pairSymbol = `${pool.left_token_symbol}/${pool.right_token_symbol}`;
        this.poolCache.set(pairSymbol.toLowerCase(), pool.address);
      });

      this.cacheTimestamp = Date.now();
    } catch (error) {
      console.error("Failed to initialize pool cache:", error);
    }
  }

  private async refreshCacheIfNeeded(): Promise<void> {
    if (Date.now() - this.cacheTimestamp > this.CACHE_TTL) {
      await this.initializeTokenCache();
      await this.initializePoolCache();
    }
  }

  public async getTokenAddress(symbolOrName: string): Promise<string> {
    await this.refreshCacheIfNeeded();

    const key = symbolOrName.toLowerCase();
    const address = this.tokenCache.get(key);
    console.log("key", key);
    if (!address) {
      throw new Error(`Token ${symbolOrName} not found`);
    }

    return address;
  }

  public async getPoolAddress(pairSymbol: string): Promise<string> {
    await this.refreshCacheIfNeeded();

    const key = pairSymbol.toLowerCase();
    const address = this.poolCache.get(key);

    if (!address) {
      throw new Error(`Pool for pair ${pairSymbol} not found`);
    }

    return address;
  }

  async get(
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<string> {
    try {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;

      if (!content) {
        throw new Error("No message content provided");
      }

      // Extract token identifier
      const tokenIdentifier = this.extractToken(content);
      const pairIdentifier = this.extractPair(content);

      console.log("Extracted token identifier:", tokenIdentifier);
      console.log("pair Identifier", pairIdentifier);
      // Early return if no token is found
      if (pairIdentifier) {
        // Fetch pair price
        const poolAddress = await this.getPoolAddress(pairIdentifier);
        const pairData = await this.fetchPairPrice(poolAddress);

        return this.formatPairPriceData(pairIdentifier, pairData);
      } else if (tokenIdentifier) {
        // Fetch token price
        const isAddress = /^EQ[a-zA-Z0-9_-]{48}$/.test(tokenIdentifier);

        let tokenAddress: string;
        let tokenName: string;

        if (isAddress) {
          // Direct address provided
          tokenAddress = tokenIdentifier;
          tokenName = await this.getTokenNameByAddress(tokenAddress);
        } else {
          // Name/symbol provided - resolve to address
          tokenName = tokenIdentifier;
          tokenAddress = await this.getTokenAddress(tokenName);
        }

        const tokenData = await this.fetchTokenPrice(tokenAddress);
        return this.formatTokenPriceData(tokenName, tokenAddress, tokenData);
      } else {
        return "No token or pair identifier found in the message.";
      }
    } catch (error) {
      console.error("TonTokenPriceProvider error:", error);
      return `Error: ${error.message}`;
    }
  }

  private extractPair(content: string): string | null {
    const patterns = [
      /(?:price|value|worth|valuation|rate)\s+(?:of|for|on)\s+["']?(.+?)\/(.+?)(?:["']|\b)/i,
      /(?:what'?s?|what is|check|show|tell me)\s+(?:the )?(?:price|value|worth)\s+(?:of|for|on)\s+["']?(.+?)\/(.+?)(?:["']|\b)/i,
      /(?:how (?:much|is|does)\s+["']?(.+?)\/(.+?)(?:["']|\b)\s+(?:cost|worth|value|priced))/i,
    ];

    const normalizedContent = content
      .replace(/[.,!?;](?=\s|$)/g, "") // Remove trailing punctuation
      .replace(/\s{2,}/g, " "); // Normalize whitespace

    for (const pattern of patterns) {
      const match = normalizedContent.match(pattern);
      if (match) {
        const token1 = match[1]?.trim();
        const token2 = match[2]?.trim();
        if (token1 && token2) {
          return `${this.normalizeToken(token1)}/${this.normalizeToken(
            token2
          )}`;
        }
      }
    }

    return null;
  }

  private extractToken(content: string): string | null {
    const patterns = [
      // 1. Direct address matches (TON format)
      /\b(EQ[a-zA-Z0-9_-]{48})\b/i,

      // 2. Explicit symbol matches
      /(?:\$|#|token:?|symbol:?)\s*([a-z0-9]+(?:\s+[a-z0-9]+)*)/i,

      // 3. Price request patterns
      /(?:price|value|worth|valuation|rate)\s+(?:of|for|on)\s+["']?(.+?)(?:["']|\b)(?:\s+token)?(?: right now| today| currently)?/i,
      /(?:what'?s?|what is|check|show|tell me)\s+(?:the )?(?:price|value|worth)\s+(?:of|for|on)\s+["']?(.+?)(?:["']|\b)/i,
      /(?:how (?:much|is|does)\s+["']?(.+?)(?:["']|\b)\s+(?:cost|worth|value|priced))/i,

      // 4. Natural language patterns
      /(?:about|regarding|for|on)\s+["']?(the\s+)?(.+?)(?:["']|\b)(?:\s+token)?(?:\s+price| value| worth)/i,
      /\b(?:looking|want)\s+to\s+know\s+(?:the )?(?:price|value)\s+(?:of|for)\s+["']?(.+?)(?:["']|\b)/i,
    ];

    const normalizedContent = content
      .replace(/[.,!?;](?=\s|$)/g, "") // Remove trailing punctuation
      .replace(/\s{2,}/g, " "); // Normalize whitespace

    for (const pattern of patterns) {
      const match = normalizedContent.match(pattern);
      if (match) {
        // Find the first non-empty capture group
        const token = match.slice(1).find((g) => g?.trim());
        if (token) {
          console.log("token", token);
          const normalizedToken = token
            .replace(/^(the|a|an)\s+/i, "") // Remove articles
            .replace(/\s+(token|coin|currency)$/i, "")
            .trim();
          console.log("normalizedToken", normalizedToken);
          // Check if the token is in pair format (e.g., TON/NOT)
          if (normalizedToken.includes("/")) {
            return null; // Return null for pairs
          }

          return this.normalizeToken(normalizedToken);
        }
      }
    }

    return null;
  }

  private normalizeToken(token: string): string {
    // Handle special cases and common misspellings
    const replacements: Record<string, string> = {
      notcoin: "NOT",
      "not coin": "NOT",
      dedust: "DDST",
      "de dust": "DDST",
      jetton: "JETTON",
      toncoin: "TON",
      "the ton": "TON",
      dogscoin: "DOGS",
    };

    return replacements[token.toLowerCase()] || token.toUpperCase();
  }

  private async getTokenNameByAddress(address: string): Promise<string> {
    const apiUrl = `https://tonapi.io/v2/jettons/${address}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.metadata?.name || address; // Fallback to address if name not found;
    } catch (error) {
      console.error("Token metadata fetch error:", error);
      return address; // Return address as fallback name
    }
  }

  public async fetchTokenPrice(
    tokenAddress: string
  ): Promise<TonApiRateResponse> {
    try {
      // Method 1: Using node-fetch with automatic decompression

      // Then fetch price using the address
      const endpoint = `${this.TONAPI_ENDPOINT}/rates?tokens=${tokenAddress}&currencies=usd`;

      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
      });

      // Get the raw buffer from the response
      const buffer = await response.arrayBuffer();

      // Convert ArrayBuffer to Buffer
      const nodeBuffer = Buffer.from(buffer);

      try {
        // Try parsing directly first
        const directText = new TextDecoder().decode(nodeBuffer);
        // console.log(directText);
        return JSON.parse(directText);
      } catch (e) {
        console.log("Direct parsing failed, trying decompression...");

        // If direct parsing fails, try decompressing
        try {
          const decompressed = await gunzipAsync(nodeBuffer);
          const text = decompressed.toString("utf-8");
          return JSON.parse(text);
        } catch (decompressError) {
          console.error("Decompression failed:", decompressError);
          throw new Error("Failed to decompress response");
        }
      }
    } catch (error) {
      console.error("Fetch error:", error);
      throw error;
    }
  }

  public async fetchPairPrice(
    poolAddress: string
  ): Promise<DexScreenerResponse> {
    try {
      const response = await fetch(
        `${this.DEXSCREENER_API_ENDPOINT}/${poolAddress}`
      );
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Fetch pair price error:", error);
      throw error;
    }
  }

  public formatPairPriceData(
    pairSymbol: string,
    data: DexScreenerResponse
  ): string {
    const pairData = data.pairs[0];
    if (!pairData) {
      throw new Error(`No price data found for pair ${pairSymbol}`);
    }

    const priceNative = pairData.priceNative;
    const priceUsd = pairData.priceUsd;
    const priceChange = pairData.priceChange;

    return `Pair: ${pairSymbol}
            Price (Native): ${priceNative}
            Price (USD): ${priceUsd}
            1h Change: ${priceChange.h1}%
            6h Change: ${priceChange.h6}%
            24h Change: ${priceChange.h24}%`;
  }

  public formatTokenPriceData(
    tokenName: string,
    tokenAddress: string,
    data: TonApiRateResponse
  ): string {
    const tokenData = data.rates[tokenAddress];
    //  console.log("tokenData  in function ", data.rates.tokenAddress);
    if (!tokenData) {
      throw new Error(`No price data found for token ${tokenName}`);
    }

    const price = tokenData.prices.USD.toFixed(6);
    const diff24h = tokenData.diff_24h.USD;
    const diff7d = tokenData.diff_7d.USD;
    const diff30d = tokenData.diff_30d.USD;

    return ` Current price: $${price} USD
             24h change: ${diff24h}
             7d change: ${diff7d}
             30d change: ${diff30d}`;
  }
}

export const tonTokenPriceProvider = new TonTokenPriceProvider();
