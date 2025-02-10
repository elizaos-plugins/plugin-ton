export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    quoteToken: {
      address: string;
      name: string;
      symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    priceChange: {
      h1: number;
      h6: number;
      h24: number;
    };
  }[];
}

export interface TonApiRateResponse {
  rates: {
    [key: string]: {
      prices: {
        USD: number;
      };
      diff_24h: {
        USD: string;
      };
      diff_7d: {
        USD: string;
      };
      diff_30d: {
        USD: string;
      };
    };
  };
}
