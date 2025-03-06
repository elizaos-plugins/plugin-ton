import {
    elizaLogger,
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    generateObject,
    composeContext,
    ModelClass,
    generateObjectArray
} from '@elizaos/core';
import { Dictionary, fromNano } from '@ton/ton';
import BigNumber from "bignumber.js";
import { z } from 'zod';
import { convertToBigInt, formatCurrency } from '../utils/util';
import evaaPkg from '@evaafi/sdk';
const {
    Evaa,
    FEES,
    TON_TESTNET,
    TESTNET_POOL_CONFIG,
    JUSDC_TESTNET,
    JUSDT_TESTNET,
    UserDataActive,
    AssetData,
    BalanceChangeType,
    calculatePresentValue,
    calculateCurrentRates,
    MasterConstants,
    AssetConfig,
    ExtendedAssetData,
    PoolAssetConfig,
    mulFactor,
    predictAPY,
    PricesCollector
}  = evaaPkg;

import {
    initWalletProvider,
    type WalletProvider,
    nativeWalletProvider,
} from "../providers/wallet";


// For display, convert the fixed-point numbers to floating point with human-readable formatting:
function formatFixedPoint(x: bigint, decimals: number = 13): string {
    // This converts the integer value to a string with the implied decimal point.
    const factor = 10 ** decimals;
    const value = Number(x) / factor;

    // Format with commas for thousands separators and appropriate decimal places
    return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
}

/**
 * Calculate accrued interest over an elapsed time period.
 *
 * @param principal - The principal in fixed-point form (13 decimals)
 * @param supplyRate - The annual supply rate in fixed-point (13 decimals)
 * @param elapsedSeconds - The elapsed time in seconds over which interest accrues
 * @param ONE - The scaling factor (10^13 for 13 decimals)
 * @returns The accrued interest in fixed-point representation.
 */
function calculateAccruedInterest(
    principal: bigint,
    supplyRate: bigint,
    elapsedSeconds: bigint,
    ONE: bigint
): bigint {
    // There are 31,536,000 seconds in a 365-day year.
    const SECONDS_PER_YEAR = 31536000n;
    return (principal * supplyRate * elapsedSeconds) / (ONE * SECONDS_PER_YEAR);
}

export const positionItemSchema = z.object({
    assetId: z.string().nullable(),
    principal: z.string().nullable().optional(),
    borrowInterest: z.string().nullable().optional(),
    borrowRate: z.string().nullable().optional(),
    supplyInterest: z.string().nullable().optional(),
    supplyRate: z.string().nullable().optional(),
    annualInterestRate: z.string().nullable().optional(),
    dailyInterestRate: z.string().nullable().optional(),
    dailyInterest: z.string().nullable().optional(),
    //accruedInterest: z.string().nullable().optional(),
    healthFactor: z.number().nullable().optional(),
    liquidationThreshold: z.number().nullable().optional(),
});

export const positionsSchema = z.object({
    positions: z.array(positionItemSchema)
});

export type PositionItemContent = z.infer<typeof positionItemSchema>;
export type PositionsContent = z.infer<typeof positionsSchema>;

function isPositionItemContent(content: any): content is PositionItemContent {
    return (
        (content.assetId === null || typeof content.assetId === "string") &&
        (content.principal === null || typeof content.principal === "string" || content.principal === undefined) &&
        (content.borrowInterest === null || typeof content.borrowInterest === "string" || content.borrowInterest === undefined) &&
        (content.borrowRate === null || typeof content.borrowRate === "string" || content.borrowRate === undefined) &&
        (content.supplyInterest === null || typeof content.supplyInterest === "string" || content.supplyInterest === undefined) &&
        (content.supplyRate === null || typeof content.supplyRate === "string" || content.supplyRate === undefined) &&
        (content.annualInterestRate === null || typeof content.annualInterestRate === "string" || content.annualInterestRate === undefined) &&
        (content.dailyInterestRate === null || typeof content.dailyInterestRate === "string" || content.dailyInterestRate === undefined) &&
        (content.dailyInterest === null || typeof content.dailyInterest === "string" || content.dailyInterest === undefined) &&
        //(content.accruedInterest === null || typeof content.accruedInterest === "string" || content.accruedInterest === undefined) &&
        (content.healthFactor === null || typeof content.healthFactor === "number" || content.healthFactor === undefined) &&
        (content.liquidationThreshold === null || typeof content.liquidationThreshold === "number" || content.liquidationThreshold === undefined)
    );
}

function isPositionsContent(content: any): content is PositionsContent {
    return (
        Array.isArray(content.positions) &&
        content.positions.every((item: any) => isPositionItemContent(item))
    );
}

export const positionsTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "positions": [
        {
            "assetId": "TON",
            "principal": "0",
            "borrowInterest": "0",
            "borrowRate": "0",
            "supplyInterest": "0",
            "supplyRate": "0",
            "annualInterestRate": "0",
            "dailyInterestRate": "0",
            "dailyInterest": "0",
            "healthFactor": 0,
            "liquidationThreshold": 0
        },
        {
            "assetId": "USDT",
            "principal": "0",
            "borrowInterest": "0",
            "borrowRate": "0",
            "supplyInterest": "0",
            "supplyRate": "0",
            "annualInterestRate": "0",
            "dailyInterestRate": "0",
            "dailyInterest": "0",
            "healthFactor": 0,
            "liquidationThreshold": 0
        },
        {
            "assetId": "USDC",
            "principal": "0",
            "borrowInterest": "0",
            "borrowRate": "0",
            "supplyInterest": "0",
            "supplyRate": "0",
            "annualInterestRate": "0",
            "dailyInterestRate": "0",
            "dailyInterest": "0",
            "healthFactor": 0,
            "liquidationThreshold": 0
        }
    ]
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the borrowed positions:
- Asset ID (TON, USDT, USDC, etc.)
- Principal amount borrowed (if mentioned)
- Borrow interest (if mentioned)
- Borrow rate (if mentioned)
- Supply interest (if mentioned)
- Supply rate (if mentioned)
- Annual interest rate (if mentioned)
- Daily interest rate (if mentioned)
- Daily interest (if mentioned)
- Health factor (if mentioned)
- Liquidation threshold (if mentioned)
- Make sure to remove \`\`\`json and \`\`\` from the response

Respond with a JSON markdown block containing only the extracted values.`;

interface EvaaAsset {
    name: string;
    config: typeof AssetConfig;
    data: typeof ExtendedAssetData;
    asset: any;
}

export class PositionsAction {
    private walletProvider: WalletProvider;
    private evaa: typeof Evaa;
    private assetsData: Dictionary<bigint, typeof ExtendedAssetData>;
    private assetsConfig: Dictionary<bigint, typeof AssetConfig>;
    private masterConstants: typeof MasterConstants;
    private USDT: EvaaAsset;
    private USDC: EvaaAsset;
    private TON: EvaaAsset;
    private totalSupply: bigint;
    private totalBorrow: bigint;
    private collector: typeof PricesCollector;
    userAssets: Array<EvaaAsset>;
    borrowInterest: bigint;
    predictAPY: bigint;
    withdrawalLimits: Dictionary<bigint, bigint>
    borrowLimits: Dictionary<bigint, bigint>


    constructor(walletProvider: WalletProvider) {
        this.walletProvider = walletProvider;
        this.evaa = null;
        this.assetsData = null;
        this.assetsConfig = null;
        this.masterConstants = null;
        this.USDT = null;
        this.USDC = null;
        this.TON = null;
        this.userAssets = null;
        this.totalSupply = null;
        this.totalBorrow = null;
        this.borrowInterest = null;
        this.predictAPY = null;
        this.collector = null;
        this.withdrawalLimits = null;
        this.borrowLimits = null;
    }

    public async getPositions(): Promise<PositionsContent[]> {

            // Initialize TON client and Evaa SDK
            // Get wallet instance
            const walletClient = this.walletProvider.getWalletClient();
            const wallet = walletClient.open(this.walletProvider.wallet);

            // Initialize EVAA SDK
            this.evaa = walletClient.open(
                new Evaa({poolConfig: TESTNET_POOL_CONFIG}),
            );
            await this.evaa.getSync();

            this.assetsData = this.evaa.data?.assetsData!;
            this.assetsConfig = this.evaa.data?.assetsConfig!;
            this.masterConstants = this.evaa.poolConfig.masterConstants;
            this.USDT = {
                name: "USDT",
                data: this.assetsData.get(JUSDT_TESTNET.assetId)!,
                config: this.assetsConfig.get(JUSDT_TESTNET.assetId)!,
                asset: JUSDT_TESTNET
            }
            this.USDC = {
                name: "USDC",
                data: this.assetsData.get(JUSDC_TESTNET.assetId)!,
                config: this.assetsConfig.get(JUSDC_TESTNET.assetId)!,
                asset: JUSDC_TESTNET
            }
            this.TON = {
                name: "TON",
                data: this.assetsData.get(TON_TESTNET.assetId)!,
                config: this.assetsConfig.get(TON_TESTNET.assetId)!,
                asset: TON_TESTNET
            }

            // Set user assets portfolio
            this.userAssets = [
                this.USDT,
                this.USDC,
                this.TON
            ]

            this.totalSupply = calculatePresentValue(this.TON.data.sRate, this.TON.data.totalSupply, this.masterConstants);
            this.totalBorrow = calculatePresentValue(this.TON.data.bRate, this.TON.data.totalBorrow, this.masterConstants);
            // Calculate borrow interest - ensure all values are BigInt and handle potential undefined values
            try {
                // Only calculate if all required values are available
                if (this.TON?.config?.baseBorrowRate && this.masterConstants?.FACTOR_SCALE && 
                    this.TON?.config?.borrowRateSlopeLow && this.TON?.config?.targetUtilization &&
                    this.TON?.config?.borrowRateSlopeHigh) {
                    
                    const baseBorrowRate = BigInt(this.TON.config.baseBorrowRate);
                    const factorScale = BigInt(this.masterConstants.FACTOR_SCALE);
                    const slopeLow = BigInt(this.TON.config.borrowRateSlopeLow);
                    const slopeHigh = BigInt(this.TON.config.borrowRateSlopeHigh);
                    const targetUtil = BigInt(this.TON.config.targetUtilization);
                    
                    const term1 = mulFactor(factorScale, slopeLow, targetUtil);
                    const term2 = mulFactor(factorScale, slopeHigh, factorScale - targetUtil);
                    
                    this.borrowInterest = baseBorrowRate + BigInt(term1 || 0n) + BigInt(term2 || 0n);
                } else {
                    // Default value if data is missing
                    this.borrowInterest = 0n;
                }
            } catch (error) {
                // If any error occurs, set a default value
                elizaLogger.error('Error calculating borrow interest:', error);
                this.borrowInterest = 0n;
            }

            // Calculate APY with error handling
            try {
                // Only calculate if all required values are available
                if (this.totalBorrow && this.TON?.data && this.TON?.config && this.masterConstants) {
                    this.predictAPY = predictAPY({
                        amount: this.totalBorrow,
                        balanceChangeType: BalanceChangeType.Repay,
                        assetData: this.TON.data,
                        assetConfig: this.TON.config,
                        masterConstants: this.masterConstants
                    });
                } else {
                    // Default value if data is missing
                    this.predictAPY = { supplyAPY: 0n, borrowAPY: 0n };
                }
            } catch (error) {
                // If any error occurs, set default values
                elizaLogger.error('Error calculating APY:', error);
                this.predictAPY = { supplyAPY: 0n, borrowAPY: 0n };
            }

            // Initialize prices collector
            this.collector = new PricesCollector(TESTNET_POOL_CONFIG);

            // Open user contract
            const user = walletClient.open(
                await this.evaa.openUserContract(wallet.address)
            );
            // Fetch user data
            await user.getSync(this.evaa.data!.assetsData, this.evaa.data!.assetsConfig, (await this.collector.getPrices()).dict, true);

            // Check if the user has a active evaa contract
            const data = (user.data as typeof UserDataActive);
            elizaLogger.log('User data:', data.fullyParsed);

            if (user.data?.type != 'active') {
                elizaLogger.log('User account is not active');

                return [] as PositionsContent[];
            } else {

            this.withdrawalLimits = user.data.withdrawalLimits;
            this.borrowLimits = user.data.borrowLimits;

            // Calculate positions and accrued interest
            const positions: PositionsContent[] = [];

            /*for (const [assetId, principal] of user.data.realPrincipals) {
                const assetConfig = this.evaa.data!.assetsConfig.get(assetId);
                if (!assetConfig) continue;

                const assetData = this.evaa.data!.assetsData.get(assetId);
                if (!assetData) continue;*/

            for (const userAsset of this.userAssets) {

            // Calculate estimated rates
            const assetRates = calculateCurrentRates(userAsset.config, userAsset.data, this.masterConstants);

            const { borrowInterest, bRate, now, sRate, supplyInterest } = assetRates;
            const ONE = 10n ** 13n; // Fix: 1n ** 13n is incorrect, should be 10n ** 13n

            // Convert the raw annual supply rate into a human‑readable number.
            // For example, a stored 700000000000 becomes 700000000000 / 1e13 = 0.07 (i.e. 7% APY)
            const annualInterestRateReadable = sRate / ONE;

            // Compute the daily rate by dividing the annual rate by 365
            const dailyInterestRateReadable = annualInterestRateReadable / 365n;

            // If you want the “rate” still in fixed‑point (for further on‑chain calculations) you could do:
            const annualRateFP = sRate;              // already annual, fixed-point 13 decimals
            const dailyRateFP = sRate / 365n;           // integer division – be aware of rounding

            // To compute the daily interest on a given principal, first decide on the unit and scaling.
            // For example, if your principal is 10 “tokens” and token amounts are also represented
            // in 13 decimals, then:
            const principal = userAsset.data.balance;  // borrowed tokens in fixed-point form
            const borrowPrincipal = user.data.borrowBalance;
            const supplyPrincipal = user.data.supplyBalance;  // supply tokens in fixed-point form

            // Daily interest (in fixed point) = principal * (daily rate) / ONE
            // Fix: Division by ONE is needed, not multiplication
            // Ensure all values are BigInt to prevent type mixing errors
            let dailyBorrowInterestFP = 0n;
            let dailySupplyInterestFP = 0n;
            
            try {
                const borrowPrincipalBigInt = typeof borrowPrincipal === 'bigint' ? borrowPrincipal : BigInt(borrowPrincipal || 0);
                const supplyPrincipalBigInt = typeof supplyPrincipal === 'bigint' ? supplyPrincipal : BigInt(supplyPrincipal || 0);
                const dailyRateFPBigInt = typeof dailyRateFP === 'bigint' ? dailyRateFP : BigInt(dailyRateFP || 0);
                const ONEBigInt = typeof ONE === 'bigint' ? ONE : BigInt(ONE || 10n ** 13n);
                
                dailyBorrowInterestFP = (borrowPrincipalBigInt * dailyRateFPBigInt) / ONEBigInt;
                dailySupplyInterestFP = (supplyPrincipalBigInt * dailyRateFPBigInt) / ONEBigInt;
            } catch (error) {
                elizaLogger.error('Error calculating daily interest:', error);
                // Default values already set
            }

            // Calculate health factor
            const healthFactor = user.data.healthFactor;

            // Calculate elapsed time since last accrual:
            //const elapsedSeconds = now - userAsset.data.lastAccural;

            // Debugging
            elizaLogger.debug("Asset ID" , userAsset.name);
            elizaLogger.debug("-------------------------------------------------");
            elizaLogger.debug("Asset Balance" , principal ? (Number(principal.toString()) / Number(ONE)).toFixed(2) : "0.00");
            elizaLogger.debug("Asset Borrow Balance" , borrowPrincipal ? (Number(borrowPrincipal.toString()) / Number(ONE)).toFixed(2) : "0.00");
            elizaLogger.debug("Asset Supply Balance" , supplyPrincipal ? (Number(supplyPrincipal.toString()) / Number(ONE)).toFixed(2) : "0.00");
            elizaLogger.debug("-------------------------------------------------");
            elizaLogger.debug("Asset Balance" , principal ? principal.toString() : "0");
            elizaLogger.debug("Asset Borrow Balance" , borrowPrincipal ? borrowPrincipal.toString() : "0");
            elizaLogger.debug("Asset Supply Balance" , supplyPrincipal ? supplyPrincipal.toString() : "0");
            elizaLogger.debug("-------------------------------------------------");
            elizaLogger.debug("Asset Balance" , principal ? formatCurrency(fromNano(principal), 2) : "0.00");
            elizaLogger.debug("Asset Borrow Balance" , borrowPrincipal ? formatCurrency(fromNano(borrowPrincipal), 2) : "0.00");
            elizaLogger.debug("Asset Supply Balance" , supplyPrincipal ? formatCurrency(fromNano(supplyPrincipal), 2) : "0.00");
            elizaLogger.debug("Borrow Interest" , formatCurrency(fromNano(borrowInterest), 6));
            elizaLogger.debug("Borrow Rate" , formatCurrency(fromNano(bRate / 100n), 2));
            elizaLogger.debug("Supply Interest" , formatCurrency(fromNano(supplyInterest), 6));
            elizaLogger.debug("Supply Rate", formatCurrency(fromNano(sRate / 100n), 2));
            elizaLogger.debug("Now" , now.toString());
            elizaLogger.debug("Annual Interest Rate: ", formatCurrency(fromNano(annualInterestRateReadable / 100n), 6)); // e.g. 0.07 for 7%
            elizaLogger.debug("Daily Interest Rate:  ", formatCurrency(fromNano(dailyInterestRateReadable / 100n), 6));  // e.g. ~0.0001918 (0.01918% per day)
            elizaLogger.debug("Daily Borrow Interest (on 1 token):", formatCurrency(fromNano(dailyBorrowInterestFP / 10n ** 13n), 6));
            elizaLogger.debug("Daily Supply Interest (on 1 token):", formatCurrency(fromNano(dailySupplyInterestFP / 10n ** 13n), 6));
            elizaLogger.debug("Annual Rate:",  formatCurrency(fromNano(annualRateFP / 100n), 2));
            elizaLogger.debug("Health Factor: ", healthFactor.toString());

            // Calculate accrued interest (in fixed-point format) over the elapsed period:
            //const accruedInterestFP = calculateAccruedInterest(principal, sRate, elapsedSeconds, ONE);
            //elizaLogger.debug("Accrued Interest (since last accrual):", formatFixedPoint(accruedInterestFP));

                positions.push({
                    assetId: userAsset.name as string,
                    principal: principal ? formatCurrency(fromNano(principal), 2) : "0.00",
                    borrowInterest: borrowInterest ? formatCurrency(fromNano(borrowInterest), 6) : "0.000000",
                    borrowRate: bRate ? formatCurrency(fromNano(bRate / 100n), 2) : "0.00",
                    supplyInterest: supplyInterest ? formatCurrency(fromNano(supplyInterest), 6) : "0.000000",
                    supplyRate: sRate ? formatCurrency(fromNano(sRate / 100n), 2) : "0.00",
                    annualInterestRate: annualInterestRateReadable ? formatCurrency(fromNano(annualInterestRateReadable / 100n), 6) + '%' : "0.000000%",
                    dailyInterestRate: dailyInterestRateReadable ? formatCurrency(fromNano(dailyInterestRateReadable / 100n), 6) + '%' : "0.000000%",
                    dailyInterest: dailyBorrowInterestFP ? formatCurrency(fromNano(dailyBorrowInterestFP / 10n ** 13n), 6) + '%' : "0.000000%",
                    //accruedInterest: formatFixedPoint(accruedInterestFP),
                    healthFactor: typeof healthFactor === 'bigint' ? Number(healthFactor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : healthFactor,
                    liquidationThreshold: typeof userAsset.config.liquidationThreshold === 'bigint' ?
                        Number(userAsset.config.liquidationThreshold).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : userAsset.config.liquidationThreshold
                });

            }

            return positions;
        }

    }

}

const positionsAction: Action = {
    name: 'EVAA_POSITIONS',
    similes: [
        'BORROW_POSITIONS',
        'GET_BORROW_POSITIONS',
        'VIEW_BORROWED_POSITIONS',
        'CHECK_LOAN_STATUS',
        'SHOW_BORROWED_ASSETS'
    ],
    description: 'Calculates and displays accrued interest and health factors for borrowed positions',

    validate: async (runtime: IAgentRuntime) => {
        const walletProvider = await initWalletProvider(runtime);
        return !!walletProvider.getAddress();
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback?: HandlerCallback
    ) => {
        elizaLogger.info('Starting GetBorrowPositions handler');

        try {
            // Compose context to extract borrowing parameters
            const positionsContext = composeContext({
                state,
                template: positionsTemplate
            });

            const content = await generateObject({
                runtime,
                context: positionsContext,
                schema: positionsSchema,
                modelClass: ModelClass.LARGE,
            });

            const positionsDetails = content.object as PositionsContent;
            elizaLogger.debug(`Positions details: ${JSON.stringify(content.object)}`);

            // Validate the positions object
            if (!isPositionsContent(positionsDetails)) {
                throw new Error("Invalid borrowing parameters");
            }

            const walletProvider = await initWalletProvider(runtime);
            const action = new PositionsAction(walletProvider);
            const positions = await action.getPositions();

            if (callback) {
                // Use the positions array from the action
                const responseObject = {
                    positions: positions
                };

                let responseText = `You have ${responseObject.positions.length} evaa positions:\n`;

                // Add positions information
                for (let position of responseObject.positions) {
                    const textPosition =`
                        Asset: ${position.assetId}
                        Balance: ${position.principal} ${position.assetId} tokens
                        Borrow Interest: ${position.borrowInterest} units
                        Borrow Rate: ${position.borrowRate} units
                        Supply Interest: ${position.supplyInterest} units
                        Supply Rate: ${position.supplyRate} units
                        Annual Interest Rate: ${position.annualInterestRate}
                        Daily Interest Rate: ${position.dailyInterestRate}
                        Daily Interest: ${position.dailyInterest}
                        Health Factor: ${position.healthFactor} (safe > 1.0)
                        Liquidation Threshold: ${position.liquidationThreshold} units
                        \n`

                        responseText += textPosition;
                }

                callback({
                    text: responseText,
                    status: "success",
                    positions: responseObject.positions,
                    metadata: {
                        positions: responseObject.positions,
                        totalPositions: positions.length,
                        timestamp: Date.now()
                    }
                });
            }

            return true;

        } catch (error) {
            elizaLogger.error(`Error in get borrowed positions handler: ${error}`);
            if (callback) {
                callback({
                    text: `Failed to get borrowed positions: ${error.message}`,
                    status: "error"
                });
            }
            return false;
        }
    },

    examples: [
        [
            {
                user: '{{user1}}',
                content: {
                    text: 'Show me my positions and accrued interest from the EVAA protocol',
                }
            },
            {
                user: '{{agentName}}',
                content: {
                    text: '{{responseData}}',
                    action: 'POSITIONS'
                }
            }
        ],
        [
            {
                user: '{{user1}}',
                content: {
                    text: 'What is my current health factor across all positions?'
                }
            },
            {
                user: '{{agentName}}',
                content: {
                    text: '{{responseData}}',
                    action: 'POSITIONS'
                }
            }
        ]
    ]
};

export default positionsAction;
