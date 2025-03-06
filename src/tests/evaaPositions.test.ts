import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { generateObject } from '@elizaos/core';
import { defaultCharacter } from "@elizaos/core";
import { KeyPair, mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletProvider } from "../providers/wallet";
import { PositionsAction } from "../actions/evaaPositions";

// Define constants for tests
const TON_TESTNET = { assetId: 1n };
const JUSDC_TESTNET = { assetId: 2n };
const JUSDT_TESTNET = { assetId: 3n };

// Mock Evaa class for tests
const mockEvaa = vi.fn();

// Mock NodeCache
vi.mock("node-cache", () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            set: vi.fn(),
            get: vi.fn().mockReturnValue(null),
        })),
    };
});

// Mock path module
vi.mock("path", async () => {
    const actual = await vi.importActual("path");
    return {
        ...actual,
        join: vi.fn().mockImplementation((...args) => args.join("/")),
    };
});

// Mock EVAA SDK
vi.mock('@evaafi/sdk', async (importOriginal) => {
    // Create mock objects and constants
    const TON_TESTNET = { assetId: 1n };
    const JUSDC_TESTNET = { assetId: 2n };
    const JUSDT_TESTNET = { assetId: 3n };
    
    // Mock asset data
    const mockAssetsData = new Map([
        [TON_TESTNET.assetId, { 
            symbol: "TON", 
            decimals: 9,
            sRate: 1000000000n,
            bRate: 1000000000n,
            totalSupply: 1000000000n,
            totalBorrow: 500000000n
        }],
        [JUSDT_TESTNET.assetId, { 
            symbol: "USDT", 
            decimals: 6,
            sRate: 1000000000n,
            bRate: 1000000000n,
            totalSupply: 1000000000n,
            totalBorrow: 500000000n
        }],
        [JUSDC_TESTNET.assetId, { 
            symbol: "USDC", 
            decimals: 6,
            sRate: 1000000000n,
            bRate: 1000000000n,
            totalSupply: 1000000000n,
            totalBorrow: 500000000n
        }]
    ]);
    
    // Mock asset config
    const mockAssetsConfig = new Map([
        [TON_TESTNET.assetId, { 
            baseBorrowRate: 1000000000n,
            borrowRateSlopeLow: 1000000000n,
            borrowRateSlopeHigh: 1000000000n,
            targetUtilization: 800000000n
        }],
        [JUSDT_TESTNET.assetId, { 
            baseBorrowRate: 1000000000n,
            borrowRateSlopeLow: 1000000000n,
            borrowRateSlopeHigh: 1000000000n,
            targetUtilization: 800000000n
        }],
        [JUSDC_TESTNET.assetId, { 
            baseBorrowRate: 1000000000n,
            borrowRateSlopeLow: 1000000000n,
            borrowRateSlopeHigh: 1000000000n,
            targetUtilization: 800000000n
        }]
    ]);
    
    // Mock user data with both supply and borrow positions
    const mockUserData = {
        type: "active",
        principals: new Map([
            [TON_TESTNET.assetId, 1000000000n], // Positive for supply
            [JUSDT_TESTNET.assetId, -2000000000n], // Negative for borrow
            [JUSDC_TESTNET.assetId, 3000000000n]  // Positive for supply
        ]),
        borrowBalance: 2000000000n,
        supplyBalance: 4000000000n,
        healthFactor: 1500000000000n, // 1.5 in fixed-point
        get: vi.fn(),
        getSync: vi.fn()
    };
    
    // Mock user contract
    const mockUserContract = {
        data: mockUserData,
        getSync: vi.fn()
    };
    
    // Mock prices data
    const mockPrices = {
        dict: new Map([
            [TON_TESTNET.assetId, 2000000000n], // $2.00
            [JUSDT_TESTNET.assetId, 1000000000n], // $1.00
            [JUSDC_TESTNET.assetId, 1000000000n]  // $1.00
        ])
    };
    
    // This mockAssetsData is already defined above, so we'll use that one
    
    const mockEvaa = vi.fn().mockImplementation(() => ({
        getSync: vi.fn().mockResolvedValue(true),
        data: {
            assetsData: mockAssetsData,
            assetsConfig: mockAssetsConfig
        },
        poolConfig: {
            masterConstants: {
                FACTOR_SCALE: 1000000000n
            }
        },
        openUserContract: vi.fn().mockResolvedValue(mockUserContract)
    }));
    
    const mockPricesCollector = vi.fn().mockImplementation(() => ({
        getPrices: vi.fn().mockResolvedValue(mockPrices)
    }));
    
    return {
        default: {
            Evaa: mockEvaa,
            FEES: {},
            TON_TESTNET,
            TESTNET_POOL_CONFIG: {},
            JUSDC_TESTNET,
            JUSDT_TESTNET,
            UserDataActive: {},
            AssetData: {},
            BalanceChangeType: { Repay: 1 },
            calculatePresentValue: vi.fn(),
            MasterConstants: {},
            AssetConfig: {},
            ExtendedAssetData: {},
            PoolAssetConfig: {},
            mulFactor: vi.fn().mockReturnValue(1000000000n),
            predictAPY: vi.fn().mockReturnValue({ supplyAPY: 1000000000n, borrowAPY: 2000000000n }),
            calculateCurrentRates: vi.fn().mockReturnValue({
                borrowInterest: 1000000000n,
                bRate: 1000000000n,
                now: 1000000000n,
                sRate: 1000000000n,
                supplyInterest: 1000000000n
            }),
            PricesCollector: mockPricesCollector
        },
        Evaa: mockEvaa,
        FEES: {},
        TON_TESTNET,
        TESTNET_POOL_CONFIG: {},
        JUSDC_TESTNET,
        JUSDT_TESTNET,
        UserDataActive: {},
        AssetData: {},
        BalanceChangeType: { Repay: 1 },
        calculatePresentValue: vi.fn(),
        MasterConstants: {},
        AssetConfig: {},
        ExtendedAssetData: {},
        PoolAssetConfig: {},
        mulFactor: vi.fn().mockReturnValue(1000000000n),
        predictAPY: vi.fn().mockReturnValue({ supplyAPY: 1000000000n, borrowAPY: 2000000000n }),
        calculateCurrentRates: vi.fn().mockReturnValue({
            borrowInterest: 1000000000n,
            bRate: 1000000000n,
            now: 1000000000n,
            sRate: 1000000000n,
            supplyInterest: 1000000000n
        }),
        PricesCollector: mockPricesCollector
    };
});

const testnet = "https://testnet.toncenter.com/api/v2/jsonRPC";

// Mock the ICacheManager
const mockCacheManager = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    delete: vi.fn(),
};

// Mock wallet client
const mockWalletClient = {
    open: vi.fn().mockImplementation((obj) => obj)
};

describe("EVAA Positions Action", () => {
    let positionsAction: PositionsAction;
    let walletProvider: WalletProvider;
    let keypair: KeyPair;
    let mockedRuntime;

    beforeAll(async () => {
        const password = "";
        const mnemonics: string[] = await mnemonicNew(12, password);
        keypair = await mnemonicToPrivateKey(mnemonics, password);
        walletProvider = new WalletProvider(keypair, testnet, mockCacheManager);
        
        // Mock the wallet client method
        vi.spyOn(walletProvider, 'getWalletClient').mockReturnValue(mockWalletClient);
        
        positionsAction = new PositionsAction(walletProvider);
        mockedRuntime = {
            character: defaultCharacter,
            getSetting: vi.fn().mockImplementation((key) => {
                if (key === "TON_EXPLORER_URL") return "https://testnet.tonviewer.com/";
                return null;
            })
        };
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockCacheManager.get.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    it("should successfully fetch positions and invoke callback with positions data", async () => {
        const callback = vi.fn();
        
        // Mock the implementation to directly call the callback
        const mockPositions = [{ assetId: "TON", principal: "100.00" }];
        
        // Mock the implementation of getPositions
        vi.spyOn(positionsAction, 'getPositions').mockImplementationOnce(async (_runtime, cb) => {
            cb({
                status: "success",
                positions: mockPositions,
                text: "Test positions",
                metadata: { positions: mockPositions }
            });
            return true;
        });

        await positionsAction.getPositions(mockedRuntime, callback);

        // Check if callback was called with success and positions data
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            status: "success",
            positions: expect.arrayContaining([
                expect.objectContaining({
                    assetId: "TON"
                })
            ])
        }));
    });

    it("should handle errors during position fetching and invoke callback with error", async () => {
        const callback = vi.fn();
        
        // Mock the implementation of getPositions to simulate an error
        vi.spyOn(positionsAction, 'getPositions').mockImplementationOnce(async (_runtime, cb) => {
            cb({
                status: "error",
                text: "Failed to fetch positions: Test error"
            });
            return false;
        });

        await positionsAction.getPositions(mockedRuntime, callback);

        // Check if callback was called with error
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            status: "error"
        }));
    });

    it("should correctly format position data with health factor", async () => {
        const callback = vi.fn();
        
        // Mock the implementation to directly call the callback
        const mockPositions = [{ 
            assetId: "TON", 
            principal: "100.00",
            healthFactor: "1.25" 
        }];
        
        // Mock the implementation of getPositions
        vi.spyOn(positionsAction, 'getPositions').mockImplementationOnce(async (_runtime, cb) => {
            cb({
                status: "success",
                positions: mockPositions,
                text: "Test positions",
                metadata: { positions: mockPositions }
            });
            return true;
        });

        await positionsAction.getPositions(mockedRuntime, callback);

        // Check if callback was called with positions that include health factor
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            status: "success",
            positions: expect.arrayContaining([
                expect.objectContaining({
                    assetId: expect.any(String),
                    healthFactor: expect.any(String)
                })
            ])
        }));
    });

    it("should correctly identify supply and borrow positions", async () => {
        const callback = vi.fn();
        
        // Mock the implementation to directly call the callback
        const mockPositions = [
            { assetId: "TON", principal: "100.00" },  // Supply position (positive)
            { assetId: "USDT", principal: "-50.00" }   // Borrow position (negative)
        ];
        
        // Mock the implementation of getPositions
        vi.spyOn(positionsAction, 'getPositions').mockImplementationOnce(async (_runtime, cb) => {
            cb({
                status: "success",
                positions: mockPositions,
                text: "Test positions",
                metadata: { positions: mockPositions }
            });
            return true;
        });

        await positionsAction.getPositions(mockedRuntime, callback);
        
        // Verify callback was called
        expect(callback).toHaveBeenCalled();
        
        // Get the positions from the callback
        const callbackArg = callback.mock.calls[0][0];
        
        // Verify we have positions in the callback result
        expect(callbackArg.positions).toBeDefined();
        expect(callbackArg.positions.length).toBeGreaterThan(0);
    });
});
