// fetchPrice.test.ts
import { describe, it, vi, expect, beforeEach, afterEach } from "vitest";
import { TonTokenPriceProvider } from "../providers/tokenProvider";
import { DexScreenerResponse, TonApiRateResponse } from "../types";

// Mock fetch globally
global.fetch = vi.fn();

// Mock data for Dedust API responses
const mockTokens = [
  {
    symbol: "TON",
    name: "Toncoin",
    address: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
  },
  {
    symbol: "NOT",
    name: "Notcoin",
    address: "EQDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWDWD",
  },
];

const mockPools = [
  {
    left_token_symbol: "TON",
    right_token_symbol: "NOT",
    address: "EQDuiv6y2IjD-4oVaJQOwR-w9fHQcz6xdXrOBgjo1In6jK9R",
  },
];

describe("TonTokenPriceProvider", () => {
  let provider: TonTokenPriceProvider;

  beforeEach(async () => {
    // Mock Dedust API responses for token and pool data
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokens),
      } as any) // Mock tokens response
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockPools),
      } as any); // Mock pools response

    // Initialize provider with mocked cache data
    provider = new TonTokenPriceProvider();

    // Wait for caches to initialize (since constructor calls async methods)
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test cases
  describe("getTokenAddress", () => {
    it("should return the correct address for TON", async () => {
      const address = await provider.getTokenAddress("TON");
      expect(address).toBe("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c");
    });
  });

  describe("getPoolAddress", () => {
    it("should return the correct address for TON/NOT", async () => {
      const address = await provider.getPoolAddress("TON/NOT");
      expect(address).toBe("EQDuiv6y2IjD-4oVaJQOwR-w9fHQcz6xdXrOBgjo1In6jK9R");
    });
  });
});
