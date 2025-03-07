// STON API doesn't support testnet assets, so we need to use a list of assets
export const testnetAssets = [
    {
        symbol: "TON",
        blacklisted: false,
        community: false,
        defaultSymbol: true,
        deprecated: false,
        decimals: 9,
        displayName: "TON",
        kind: "Ton",
        contractAddress: "EQC-0000000000000000000000000000000000000000000000000000000000000000",
        popularityIndex: 10.0,
        tags: [
            'asset:default_symbol',
            'asset:liquidity:very_high',
            'asset:essential',
            'high_liquidity',
            'default_symbol',
            'asset:popular'
        ],
        dexPriceUsd: "1.0",
    },
    {
        symbol: "TestRED",
        kind: "Jetton",
        contractAddress: "kQDLvsZol3juZyOAVG8tWsJntOxeEZWEaWCbbSjYakQpuYN5",
        blacklisted: false,
        community: false,
        defaultSymbol: true,
        deprecated: false,
        decimals: 9,
        displayName: "TestRED",
        popularityIndex: 10.0,
        tags: [
            'asset:default_symbol',
            'asset:liquidity:very_high',
            'high_liquidity',
            'default_symbol',
            'asset:popular'
        ],
        dexPriceUsd: "1.0",
    },
]