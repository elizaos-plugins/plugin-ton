import {
    elizaLogger,
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    generateObject,
    composeContext,
    ModelClass
} from '@elizaos/core';
import { Dictionary } from '@ton/ton';
import BigNumber from "bignumber.js";
import { z } from 'zod';
import { convertToBigInt } from '../../utils/util';
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
} from "../../providers/wallet";


// For display, convert the fixed-point numbers to floating point:
function formatFixedPoint(x: bigint, decimals: number = 13): string {
    // This converts the integer value to a string with the implied decimal point.
    const factor = 10 ** decimals;
    return (Number(x) / factor).toFixed(6);
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

export const positionsSchema = z.object({
    assetId: z.string().nullable().transform(val => val === null ? "TON" : val),
    principal: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    borrowInterest: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    borrowRate: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    supplyInterest: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    supplyRate: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    annualInterestRate: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    dailyInterestRate: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    dailyInterest: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    //accruedInterest: z.string().nullable().optional().transform(val => val === null ? "0" : val),
    healthFactor: z.number().nullable().optional().transform(val => val === null ? 0 : val),
    liquidationThreshold: z.number().nullable().optional().transform(val => val === null ? 0 : val),
});

export type PositionsContent = z.infer<typeof positionsSchema>;

function isPositionsContent(content: any): content is PositionsContent {
    return (
        (typeof content.assetId === "string") &&
        (typeof content.principal === "string") &&
        (typeof content.borrowInterest === "string") &&
        (typeof content.borrowRate === "string") &&
        (typeof content.supplyInterest === "string") &&
        (typeof content.supplyRate === "string") &&
        (typeof content.annualInterestRate === "string") &&
        (typeof content.dailyInterestRate === "string") &&
        (typeof content.dailyInterest === "string") &&
        //(typeof content.accruedInterest === "string") &&
        (typeof content.healthFactor === "number") &&
        (typeof content.liquidationThreshold === "number")
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
            // Calculate borrow interest
            this.borrowInterest = this.TON.config.baseBorrowRate +
            mulFactor(this.masterConstants.FACTOR_SCALE, this.TON.config.borrowRateSlopeLow, this.TON.config.targetUtilization) +
            mulFactor(
                this.masterConstants.FACTOR_SCALE,
                this.TON.config.borrowRateSlopeHigh,
                this.masterConstants.FACTOR_SCALE - this.TON.config.targetUtilization
            );

            // Calculate APY
            this.predictAPY = predictAPY({
                amount: this.totalBorrow,
                balanceChangeType: BalanceChangeType.Repay,
                assetData: this.TON.data,
                assetConfig: this.TON.config,
                masterConstants: this.masterConstants
            });

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

            for (const userAsset of this.userAssets) {

            // Calculate estimated rates
            const assetRates = calculateCurrentRates(userAsset.config, userAsset.data, this.masterConstants);

            const { borrowInterest, bRate, now, sRate, supplyInterest } = assetRates;
            const ONE = 10n ** 13n;

            // Convert the raw annual supply rate into a human‑readable number.
            // For example, a stored 700000000000 becomes 700000000000 / 1e13 = 0.07 (i.e. 7% APY)
            const annualInterestRateReadable = Number(sRate) / Number(ONE);

            // Compute the daily rate by dividing the annual rate by 365
            const dailyInterestRateReadable = annualInterestRateReadable / 365;

            // If you want the “rate” still in fixed‑point (for further on‑chain calculations) you could do:
            const annualRateFP = sRate;              // already annual, fixed-point 13 decimals
            const dailyRateFP = sRate / 365n;           // integer division – be aware of rounding

            // To compute the daily interest on a given principal, first decide on the unit and scaling.
            // For example, if your principal is 10 “tokens” and token amounts are also represented
            // in 13 decimals, then:
            const principal = convertToBigInt(userAsset.data.balance) * ONE;  // borrowed tokens in fixed-point form

            // Daily interest (in fixed point) = principal * (daily rate) / ONE
            const dailyInterestFP = (principal * dailyRateFP) / ONE;

            // Calculate health factor
            const healthFactor = user.data.healthFactor;

            // Calculate elapsed time since last accrual:
            //const elapsedSeconds = now - userAsset.data.lastAccural;

            // Debugging
            elizaLogger.debug("Asset ID" , userAsset.name);
            elizaLogger.debug("Asset Balance" , (Number(principal.toString()) / Number(ONE)).toFixed(2));
            elizaLogger.debug("Borrow Interest" , Number(borrowInterest.toString()).toFixed(4));
            elizaLogger.debug("Borrow Rate" , Number(bRate.toString()).toFixed(4));
            elizaLogger.debug("Supply Interest" , Number(supplyInterest.toString()).toFixed(4));
            elizaLogger.debug("Supply Rate", Number(sRate.toString()).toFixed(4));
            elizaLogger.debug("Now" , now.toString());
            elizaLogger.debug("Annual Interest Rate: ", (Number(annualInterestRateReadable) * 100).toFixed(2)); // e.g. 0.07 for 7%
            elizaLogger.debug("Daily Interest Rate:  ", (Number(dailyInterestRateReadable) * 100).toFixed(2));  // e.g. ~0.0001918 (0.01918% per day)
            elizaLogger.debug("Daily Interest (on 10 tokens):", (Number(formatFixedPoint(dailyInterestFP)) * 100).toFixed(4));

            // Calculate accrued interest (in fixed-point format) over the elapsed period:
            //const accruedInterestFP = calculateAccruedInterest(principal, sRate, elapsedSeconds, ONE);
            //elizaLogger.debug("Accrued Interest (since last accrual):", formatFixedPoint(accruedInterestFP));

            //const annualInterestRate = annualInterestRateReadable;
            //const dailyInterestRate = dailyInterestRateReadable;
            //const dailyInterest = formatFixedPoint(dailyInterestFP);

                /*positions.push({
                    assetId: userAsset.name,
                    principal: '0',//formatFixedPoint(principal),
                    borrowInterest: borrowInterest.toString(),
                    borrowRate: bRate.toString(),
                    supplyInterest: supplyInterest.toString(),
                    supplyRate: sRate.toString(),
                    annualInterestRate: annualInterestRateReadable.toString(),
                    dailyInterestRate: dailyInterestRateReadable.toString(),
                    dailyInterest: formatFixedPoint(dailyInterestFP),
                    //accruedInterest: formatFixedPoint(accruedInterestFP),
                    healthFactor,
                    liquidationThreshold: userAsset.config.liquidationThreshold
                });*/
            }

            //return positions;
            return [] as PositionsContent[];
        }

    }

}

export const positionsAction: Action = {
    name: 'POSITIONS',
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

            if (!isPositionsContent(positionsDetails)) {
                throw new Error("Invalid borrowing parameters");
            }

            const walletProvider = await initWalletProvider(runtime);
            const action = new PositionsAction(walletProvider);
            const positions = await action.getPositions();

            if (callback) {
                callback({
                    text: `Retrieved ${positions.length} borrowed positions`,
                    metadata: {
                        positions,
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
                    error: true
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
