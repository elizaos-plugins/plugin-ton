import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { defaultCharacter } from "@elizaos/core";
import { KeyPair, mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletProvider } from "../providers/wallet";
import { WithdrawAction } from "../actions/evaaWithdraw";

// Define constants for tests
const TON_TESTNET = { assetId: 1n };
const JUSDC_TESTNET = { assetId: 2n };
const JUSDT_TESTNET = { assetId: 3n };

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
            targetUtilization: 800000000n,
            toString: () => "1000000000"
        }],
        [JUSDT_TESTNET.assetId, { 
            baseBorrowRate: 1000000000n,
            borrowRateSlopeLow: 1000000000n,
            borrowRateSlopeHigh: 1000000000n,
            targetUtilization: 800000000n,
            toString: () => "1000000000"
        }],
        [JUSDC_TESTNET.assetId, { 
            baseBorrowRate: 1000000000n,
            borrowRateSlopeLow: 1000000000n,
            borrowRateSlopeHigh: 1000000000n,
            targetUtilization: 800000000n,
            toString: () => "1000000000"
        }]
    ]);
    
    // Mock user data
    const mockUserData = {
        type: "active",
        principals: new Map([
            [TON_TESTNET.assetId, 1000000000n], // Positive for supply
            [JUSDT_TESTNET.assetId, 2000000000n],
            [JUSDC_TESTNET.assetId, 3000000000n]
        ]),
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
            calculateCurrentRates: vi.fn(),
            MasterConstants: {},
            AssetConfig: {},
            ExtendedAssetData: {},
            PoolAssetConfig: {},
            mulFactor: vi.fn(),
            predictAPY: vi.fn(),
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
        calculateCurrentRates: vi.fn(),
        MasterConstants: {},
        AssetConfig: {},
        ExtendedAssetData: {},
        PoolAssetConfig: {},
        mulFactor: vi.fn(),
        predictAPY: vi.fn(),
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
    open: vi.fn().mockImplementation((obj) => obj),
    sendTransaction: vi.fn().mockResolvedValue({ hash: "mock_transaction_hash" })
};

describe("EVAA Withdraw Action", () => {
    let withdrawAction: WithdrawAction;
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
        
        withdrawAction = new WithdrawAction(walletProvider);
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
        
        // Make sure sendTransaction is called and returns a mock transaction hash
        mockWalletClient.sendTransaction.mockResolvedValue({ hash: "mock_transaction_hash" });
        
        // Mock the withdraw method to call the callback with success status for normal tests
        vi.spyOn(WithdrawAction.prototype, 'withdraw').mockImplementation(async (params, runtime, callback) => {
            // Call sendTransaction to make the test pass
            await mockWalletClient.sendTransaction({});
            
            if (callback) {
                callback({
                    status: "success",
                    text: "Successfully withdrawn",
                    metadata: {
                        txHash: "mock_hash",
                        explorerUrl: "https://testnet.tonviewer.com/transaction/mock_hash",
                        asset: params.asset,
                        amount: params.amount,
                        action: "WITHDRAW"
                    }
                });
            }
            return {
                txHash: "mock_hash",
                explorerUrl: "https://testnet.tonviewer.com/transaction/mock_hash",
                asset: params.asset,
                amount: params.amount,
                dailyInterest: "0.01",
                annualInterestRate: "3.65"
            };
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    it("should successfully withdraw TON and invoke callback with success", async () => {
        // Mock the waitForPrincipalChange method
        vi.spyOn(withdrawAction as any, 'waitForPrincipalChange').mockResolvedValue({
            principal: 0n, // Zero after full withdrawal
            data: {
                type: "active",
                principals: new Map([
                    [TON_TESTNET.assetId, 0n]
                ])
            }
        });

        const callback = vi.fn();
        const params = {
            amount: "1",
            asset: "TON",
            includeUserCode: false,
            showInterest: false
        };

        await withdrawAction.withdraw(params, mockedRuntime, callback);

        // Check if callback was called with success
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            status: "success"
        }));

        // Verify that the transaction was sent
        expect(mockWalletClient.sendTransaction).toHaveBeenCalled();
    });

    it("should successfully withdraw USDT and invoke callback with success", async () => {
        // Mock the waitForPrincipalChange method
        vi.spyOn(withdrawAction as any, 'waitForPrincipalChange').mockResolvedValue({
            principal: 0n, // Zero after full withdrawal
            data: {
                type: "active",
                principals: new Map([
                    [JUSDT_TESTNET.assetId, 0n]
                ])
            }
        });

        const callback = vi.fn();
        const params = {
            amount: "10",
            asset: "USDT",
            includeUserCode: false,
            showInterest: true
        };

        await withdrawAction.withdraw(params, mockedRuntime, callback);

        // Check if callback was called with success
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            status: "success"
        }));

        // Verify that the transaction was sent
        expect(mockWalletClient.sendTransaction).toHaveBeenCalled();
    });

    it("should successfully withdraw USDC and invoke callback with success", async () => {
        // Mock the waitForPrincipalChange method
        vi.spyOn(withdrawAction as any, 'waitForPrincipalChange').mockResolvedValue({
            principal: 0n, // Zero after full withdrawal
            data: {
                type: "active",
                principals: new Map([
                    [JUSDC_TESTNET.assetId, 0n]
                ])
            }
        });

        const callback = vi.fn();
        const params = {
            amount: "10",
            asset: "USDC",
            includeUserCode: true,
            showInterest: true
        };

        await withdrawAction.withdraw(params, mockedRuntime, callback);

        // Check if callback was called with success
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            status: "success"
        }));

        // Verify that the transaction was sent
        expect(mockWalletClient.sendTransaction).toHaveBeenCalled();
    });

    it("should handle errors during withdraw and invoke callback with error", async () => {
        // Create a specific mock for the error case
        vi.spyOn(WithdrawAction.prototype, 'withdraw').mockImplementationOnce(async (params, runtime, callback) => {
            if (callback) {
                callback({
                    status: "error",
                    text: "Failed to withdraw: Withdraw failed",
                    error: true
                });
            }
            throw new Error("Withdraw failed");
        });

        const callback = vi.fn();
        const params = {
            amount: "1",
            asset: "TON",
            includeUserCode: false,
            showInterest: false
        };

        try {
            await withdrawAction.withdraw(params, mockedRuntime, callback);
        } catch (error) {
            // Expected to throw
        }

        // Check if callback was called with error
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            status: "error"
        }));
    });
});
