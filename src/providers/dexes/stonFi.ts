import {
    internal,
    JettonMaster,
    SenderArguments,
    toNano,
    TonClient,
    SendMode,
} from "@ton/ton";
import {
    JettonDeposit,
    DEX,
    JettonWithdrawal,
    SupportedMethod,
} from ".";
import { pTON , DEX as StonFiDEX } from "@ston-fi/sdk";
import { WalletProvider } from "../wallet";
import { elizaLogger } from "@elizaos/core";
import { waitSeqnoContract } from "../../utils/util";

export class StonFi implements DEX {
    private walletProvider: WalletProvider;
    private client: TonClient;
    private router: any;

    supportMethods = Object.freeze([
        SupportedMethod.CREATE_POOL,
        SupportedMethod.DEPOSIT,
        SupportedMethod.WITHDRAW,
    ]);

    constructor(walletProvider: WalletProvider) {
        elizaLogger.log("StonFi: Initializing with wallet provider");
        this.walletProvider = walletProvider;

        this.client = this.walletProvider.getWalletClient();
        elizaLogger.log("StonFi: Initializing with testnet configuration");
        this.router = this.client.open(
            StonFiDEX.v2_1.Router.create(
                "kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v" // CPI Router v2.1.0
            )
        );
    }

    // Send transaction with waitSeqnoContract for confirmation
    private async sendTransaction(txParams: SenderArguments): Promise<string> {
        elizaLogger.log("StonFi: Preparing to send transaction");
        
        try {
            const contract = await this.client.open(this.walletProvider.wallet);
            const seqno = await contract.getSeqno();
            elizaLogger.log(`StonFi: Current wallet seqno: ${seqno}`);
            
            const transfer = contract.createTransfer({
                seqno: seqno,
                secretKey: this.walletProvider.keypair.secretKey,
                messages: [internal(txParams)],
                sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
            });
            
            elizaLogger.log("StonFi: Transfer message created, sending to network");
            await contract.send(transfer);
            
            elizaLogger.log(`StonFi: Transaction sent, waiting for confirmation (seqno: ${seqno})...`);
            await waitSeqnoContract(seqno, contract);
            elizaLogger.log("StonFi: Transaction confirmed successfully");
            
            // Get transaction hash
            const state = await this.client.getContractState(this.walletProvider.wallet.address);
            const txHash = state.lastTransaction?.hash || "unknown";
            elizaLogger.log(`StonFi: Transaction hash: ${txHash}`);
            
            return txHash;
        } catch (error) {
            elizaLogger.error("StonFi: Error sending transaction:", error);
            throw error;
        }
    }

    // To create a new Pool, just provide the minimum amount of liquidity to pair (1001 Jettons).
    // A basic amount of 1001 lp tokens will be reserved on pool on initial liquidity deposit with the rest going to the user.
    async createPool(jettons: JettonMaster[]) {
        elizaLogger.log("StonFi: Creating pool with jettons:", jettons.map(j => j.address.toString()));
        // Check if pool exists
        // Check if total deposit ammounts > 1001
        // Create pool
    }

    // NOTE If jettonDeposits.length === 2 we deposit into a Jetton/Jetton pool
    // If jettonDeposits.length === 1 we deposit into a TON/Jetton pool
    // If jettonDepoists[i].amount === 0 we don't deposit jetton
    // If tonAmount === 0 we don't deposit TON
    // Either jettonDeposits.length === 2 or tonAmount !== 0
    async deposit(jettonDeposits: JettonDeposit[], tonAmount?: number) {
        elizaLogger.log("StonFi: Starting deposit operation", {
            jettonDepositsCount: jettonDeposits.length,
            tonAmount,
            jettonAddresses: jettonDeposits.map(jd => jd.jetton.address.toString()),
            jettonAmounts: jettonDeposits.map(jd => jd.amount)
        });
        
        try {
            // Input validation
            if (!jettonDeposits || jettonDeposits.length === 0) {
                const error = "Invalid input: jettonDeposits array is empty or undefined";
                elizaLogger.error(`StonFi: ${error}`);
                throw new Error(error);
            }
            
            if (jettonDeposits.length === 1 && !tonAmount) {
                const error = "Wrong inputs: need either 2 jettons or 1 jetton + TON";
                elizaLogger.error(`StonFi: ${error}`);
                throw new Error(error);
            }

            let txParams;
            const userWalletAddress = this.walletProvider.wallet.address;
            elizaLogger.log(`StonFi: User wallet address: ${userWalletAddress.toString()}`);

            // Jetton/Jetton
            if (jettonDeposits.length === 2) {
                elizaLogger.log("StonFi: Preparing Jetton/Jetton deposit");
                elizaLogger.log(`StonFi: Jetton1: ${jettonDeposits[0].jetton.address.toString()}, amount: ${jettonDeposits[0].amount}`);
                elizaLogger.log(`StonFi: Jetton2: ${jettonDeposits[1].jetton.address.toString()}, amount: ${jettonDeposits[1].amount}`);
                
                // Single deposit - check if exactly one jetton has a positive amount
                if (jettonDeposits.filter((dep) => dep.amount > 0).length === 1) {
                    elizaLogger.log("StonFi: Single side provide liquidity (Jetton/Jetton)");
                    
                    const sendTokenIndex = jettonDeposits[0].amount > 0 ? 0 : 1;
                    const otherTokenIndex = sendTokenIndex === 0 ? 1 : 0;
                    
                    elizaLogger.log(`StonFi: Sending token ${jettonDeposits[sendTokenIndex].jetton.address.toString()}`);
                    elizaLogger.log(`StonFi: Other token ${jettonDeposits[otherTokenIndex].jetton.address.toString()}`);
                    
                    try {
                        txParams = await this.router.getSingleSideProvideLiquidityJettonTxParams({
                            userWalletAddress: userWalletAddress,
                            sendTokenAddress: jettonDeposits[sendTokenIndex].jetton.address,
                            sendAmount: toNano("1"),
                            otherTokenAddress: jettonDeposits[otherTokenIndex].jetton.address,
                            minLpOut: "1",
                            queryId: 123456,
                        });
                        
                        elizaLogger.log("StonFi: Single side liquidity parameters prepared successfully");
                    } catch (error) {
                        elizaLogger.error("StonFi: Failed to prepare single side liquidity parameters:", error);
                        throw new Error(`Failed to prepare single side liquidity parameters: ${error.message || error}`);
                    }
                } else {
                    // Deposit both Jettons
                    elizaLogger.log("StonFi: Providing liquidity with both jettons");
                    
                    try {
                        txParams = await Promise.all(
                            jettonDeposits.map(async (jettonDeposit, index) => {
                                elizaLogger.log(`StonFi: Preparing deposit for jetton ${index + 1}: ${jettonDeposit.jetton.address.toString()}, amount: ${jettonDeposit.amount}`);
                                
                                try {
                                    const params = await this.router.getProvideLiquidityJettonTxParams({
                                        userWalletAddress: userWalletAddress,
                                        sendTokenAddress: jettonDeposit.jetton.address,
                                        sendAmount: toNano(jettonDeposit.amount),
                                        otherTokenAddress: jettonDeposits[(index + 1) % 2].jetton.address,
                                        minLpOut: "1",
                                        queryId: 123456 + index,
                                    });
                                    elizaLogger.log(`StonFi: Successfully prepared parameters for jetton ${index + 1}`);
                                    return params;
                                } catch (error) {
                                    elizaLogger.error(`StonFi: Error preparing parameters for jetton ${index + 1}:`, error);
                                    throw new Error(`Failed to prepare parameters for jetton ${index + 1}: ${error.message || error}`);
                                }
                            })
                        );
                        
                        elizaLogger.log("StonFi: Both jettons liquidity parameters prepared successfully");
                    } catch (error) {
                        elizaLogger.error("StonFi: Failed to prepare both jettons liquidity parameters:", error);
                        throw new Error(`Failed to prepare both jettons liquidity parameters: ${error.message || error}`);
                    }
                }
            } else {
                // TON/Jetton
                elizaLogger.log("StonFi: Preparing TON/Jetton deposit");
                elizaLogger.log(`StonFi: Jetton: ${jettonDeposits[0].jetton.address.toString()}, amount: ${jettonDeposits[0].amount}`);
                elizaLogger.log(`StonFi: TON amount: ${tonAmount}`);
                
                let proxyTon;
                try {
                    proxyTon = pTON.v2_1.create(
                        "kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px" // pTON v2.1.0
                    );
                    elizaLogger.log(`StonFi: ProxyTON created successfully: ${proxyTon.address.toString()}`);
                } catch (error) {
                    elizaLogger.error("StonFi: Failed to create proxyTON:", error);
                    throw new Error(`Failed to create proxyTON: ${error.message || error}`);
                }
                
                // Deposit both TON and Jetton
                if (tonAmount > 0 && jettonDeposits[0]?.amount > 0) {
                    elizaLogger.log(`StonFi: Providing liquidity with both TON (${tonAmount}) and Jetton (${jettonDeposits[0].amount})`);
                    
                    try {
                        txParams = await Promise.all([
                            // deposit TON to the TON/Jetton pool
                            (async () => {
                                try {
                                    elizaLogger.log("StonFi: Preparing TON deposit parameters");
                                    const params = await this.router.getProvideLiquidityTonTxParams({
                                        userWalletAddress: userWalletAddress,
                                        proxyTon,
                                        sendAmount: toNano(tonAmount),
                                        otherTokenAddress: jettonDeposits[0].jetton.address,
                                        minLpOut: "1",
                                        queryId: 12345,
                                    });
                                    elizaLogger.log("StonFi: TON deposit parameters prepared successfully");
                                    return params;
                                } catch (error) {
                                    elizaLogger.error("StonFi: Error preparing TON deposit parameters:", error);
                                    throw new Error(`Failed to prepare TON deposit parameters: ${error.message || error}`);
                                }
                            })(),
                            // deposit Jetton to the TON/Jetton pool
                            (async () => {
                                try {
                                    elizaLogger.log("StonFi: Preparing Jetton deposit parameters");
                                    const params = await this.router.getProvideLiquidityJettonTxParams({
                                        userWalletAddress: userWalletAddress,
                                        sendTokenAddress: jettonDeposits[0].jetton.address,
                                        sendAmount: toNano(jettonDeposits[0].amount),
                                        otherTokenAddress: proxyTon.address,
                                        minLpOut: "1",
                                        queryId: 123456,
                                    });
                                    elizaLogger.log("StonFi: Jetton deposit parameters prepared successfully");
                                    return params;
                                } catch (error) {
                                    elizaLogger.error("StonFi: Error preparing Jetton deposit parameters:", error);
                                    throw new Error(`Failed to prepare Jetton deposit parameters: ${error.message || error}`);
                                }
                            })(),
                        ]);
                        
                        elizaLogger.log("StonFi: Both TON and Jetton liquidity parameters prepared successfully");
                    } catch (error) {
                        elizaLogger.error("StonFi: Failed to prepare TON/Jetton liquidity parameters:", error);
                        throw new Error(`Failed to prepare TON/Jetton liquidity parameters: ${error.message || error}`);
                    }
                } else {
                    if (tonAmount) {
                        // Deposit only TON
                        elizaLogger.log(`StonFi: Single side provide liquidity (TON only: ${tonAmount})`);
                        
                        try {
                            txParams = await this.router.getSingleSideProvideLiquidityTonTxParams({
                                userWalletAddress: userWalletAddress,
                                proxyTon,
                                sendAmount: toNano(tonAmount),
                                otherTokenAddress: jettonDeposits[0].jetton.address.toString(),
                                minLpOut: "1",
                                queryId: 12345,
                            });
                            
                            elizaLogger.log("StonFi: TON single side liquidity parameters prepared successfully");
                        } catch (error) {
                            elizaLogger.error("StonFi: Failed to prepare TON single side liquidity parameters:", error);
                            throw new Error(`Failed to prepare TON single side liquidity parameters: ${error.message || error}`);
                        }
                    } else {
                        // Deposit only Jetton
                        elizaLogger.log(`StonFi: Single side provide liquidity (Jetton only: ${jettonDeposits[0].amount})`);
                        
                        try {
                            txParams = await this.router.getSingleSideProvideLiquidityJettonTxParams({
                                userWalletAddress: userWalletAddress,
                                sendTokenAddress: jettonDeposits[0].jetton.address,
                                sendAmount: toNano(jettonDeposits[0].amount),
                                otherTokenAddress: proxyTon.address,
                                minLpOut: "1",
                                queryId: 12345,
                            });
                            
                            elizaLogger.log("StonFi: Jetton single side liquidity parameters prepared successfully");
                        } catch (error) {
                            elizaLogger.error("StonFi: Failed to prepare Jetton single side liquidity parameters:", error);
                            throw new Error(`Failed to prepare Jetton single side liquidity parameters: ${error.message || error}`);
                        }
                    }
                }
            }

            // Validate txParams before proceeding
            if (!txParams) {
                const error = "Transaction parameters are undefined or null";
                elizaLogger.error(`StonFi: ${error}`);
                throw new Error(error);
            }

            let txHashes = [];
            
            if (Array.isArray(txParams) && txParams.length > 0) {
                elizaLogger.log(`StonFi: Sending ${txParams.length} transactions`);
                
                for (let i = 0; i < txParams.length; i++) {
                    const txParam = txParams[i];
                    elizaLogger.log(`StonFi: Processing transaction ${i + 1} of ${txParams.length}`);
                    
                    if (!txParam) {
                        elizaLogger.error(`StonFi: Transaction parameter at index ${i} is undefined or null, skipping`);
                        continue;
                    }
                    
                    try {
                        const txHash = await this.sendTransaction(txParam);
                        elizaLogger.log(`StonFi: Transaction ${i + 1} completed successfully with hash: ${txHash}`);
                        txHashes.push(txHash);
                    } catch (error) {
                        elizaLogger.error(`StonFi: Failed to send transaction ${i + 1}:`, error);
                        throw new Error(`Failed to send transaction ${i + 1}: ${error.message || error}`);
                    }
                }
            } else {
                elizaLogger.log("StonFi: Sending single transaction");
                try {
                    const txHash = await this.sendTransaction(txParams);
                    elizaLogger.log(`StonFi: Transaction completed successfully with hash: ${txHash}`);
                    txHashes.push(txHash);
                } catch (error) {
                    elizaLogger.error("StonFi: Failed to send transaction:", error);
                    throw new Error(`Failed to send transaction: ${error.message || error}`);
                }
            }
            
            if (txHashes.length === 0) {
                const warning = "No transaction hashes were returned, operation may have failed";
                elizaLogger.warn(`StonFi: ${warning}`);
            } else {
                elizaLogger.log(`StonFi: All transactions completed with hashes: ${txHashes.join(', ')}`);
            }
            
            return txHashes[0]; // Return the first hash for compatibility
        } catch (error) {
            elizaLogger.error("StonFi: Error in deposit method:", error);
            // Add stack trace for better debugging
            if (error.stack) {
                elizaLogger.error("StonFi: Error stack trace:", error.stack);
            }
            
            // Handle specific TON blockchain error codes
            if (error.message && error.message.includes("exit_code: -13")) {
                elizaLogger.error("StonFi: Contract execution error (exit_code: -13). This typically indicates insufficient balance or incorrect contract state.");
                throw new Error("DEX operation failed: The operation could not be completed due to a contract execution error. This typically happens when there is insufficient balance or the pool doesn't exist.");
            } else if (error.message && error.message.includes("Unable to execute get method")) {
                throw new Error("DEX operation failed: Unable to execute contract method. This may indicate that the pool doesn't exist or the contract is in an invalid state.");
            } else {
                throw error;
            }
        }
    }

    async withdraw(
        jettonWithdrawals: JettonWithdrawal[],
        isTon: boolean,
        amount: number
    ) {
        elizaLogger.log("StonFi: Starting withdraw operation", {
            jettonWithdrawalsCount: jettonWithdrawals?.length || 0,
            isTon,
            amount
        });
        
        try {
            const proxyTon = pTON.v2_1.create(
                "kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px"
            );
            
            const assets: [string, string] = [
                isTon
                    ? proxyTon.address.toString()
                    : jettonWithdrawals[0].jetton.address.toString(),
                jettonWithdrawals[isTon ? 0 : 1].jetton.address.toString(),
            ];
            
            elizaLogger.log(`StonFi: Getting pool for assets: ${assets[0]}, ${assets[1]}`);
            
            const pool = this.client.open(
                await this.router.getPool({
                    token0: assets[0],
                    token1: assets[1],
                })
            );
            
            elizaLogger.log(`StonFi: Pool address: ${pool.address.toString()}`);
            
            const lpWallet = this.client.open(
                await pool.getJettonWallet({
                    ownerAddress: this.walletProvider.wallet.address,
                })
            );
            
            elizaLogger.log(`StonFi: LP wallet address: ${lpWallet.address.toString()}`);
            
            const lpWalletData = await lpWallet.getWalletData();
            elizaLogger.log(`StonFi: LP wallet balance: ${lpWalletData.balance.toString()}`);
            
            const burnAmount = amount ?? lpWalletData.balance;
            elizaLogger.log(`StonFi: Burning LP tokens: ${burnAmount.toString()}`);
            
            const txParams = await pool.getBurnTxParams({
                amount: burnAmount,
                userWalletAddress: this.walletProvider.wallet.address,
                queryId: 12345,
            });
            
            elizaLogger.log("StonFi: Burn parameters prepared, sending transaction");
            const txHash = await this.sendTransaction(txParams);
            elizaLogger.log(`StonFi: Withdraw completed with hash: ${txHash}`);
            
            return txHash;
        } catch (error) {
            elizaLogger.error("StonFi: Error in withdraw method:", error);
            throw error;
        }
    }

    async claimFee(params: { jettons; isTon }) {
        elizaLogger.log("StonFi: Starting claim fee operation", {
            jettonCount: params.jettons?.length || 0,
            isTon: params.isTon
        });
        
        try {
            // Prepare tokens to claim fee from
            const tokens = params.jettons.map((jetton) => jetton.address.toString());
            if (params.isTon) {
                tokens.push("kQDLvsZol3juZyOAVG8tWsJntOxeEZWEaWCbbSjYakQpuYN5");
            }
            
            elizaLogger.log(`StonFi: Claiming fees for ${tokens.length} tokens`);
            
            // Create vaults
            elizaLogger.log("StonFi: Getting vaults for tokens");
            const vaults = await Promise.all(
                tokens.map(async (token, index) => {
                    elizaLogger.log(`StonFi: Getting vault for token ${index + 1}: ${token}`);
                    return this.client.open(
                        await this.router.getVault({
                            tokenMinter: token,
                            user: this.walletProvider.wallet.address,
                        })
                    );
                })
            );
            
            // Withdraw fees
            elizaLogger.log("StonFi: Preparing fee withdrawal transactions");
            const txParams = await Promise.all(
                vaults.map(async (vault, index) => {
                    elizaLogger.log(`StonFi: Preparing fee withdrawal for vault ${index + 1}`);
                    return await vault.getWithdrawFeeTxParams({
                        queryId: 12345,
                    });
                })
            );
            
            let txHashes = [];
            elizaLogger.log(`StonFi: Sending ${txParams.length} fee withdrawal transactions`);
            
            for (const txParam of txParams) {
                const txHash = await this.sendTransaction(txParam);
                txHashes.push(txHash);
            }
            
            elizaLogger.log(`StonFi: All fee claims completed with hashes: ${txHashes.join(', ')}`);
            return txHashes[0]; // Return the first hash for compatibility
        } catch (error) {
            elizaLogger.error("StonFi: Error in claimFee method:", error);
            throw error;
        }
    }
}