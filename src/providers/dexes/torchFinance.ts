import {
    JettonDeposit,
    DEX,
    Token,
    JettonWithdrawal,
    SupportedMethod,
  } from ".";
  import {
    TorchSDK,
    generateQueryId,
    DepositParams,
    toUnit,
    WithdrawParams,
    TorchSDKOptions,
  } from "@torch-finance/sdk";
  import { Asset } from "@torch-finance/core";
  import {
    Address,
    internal,
    SenderArguments,
    SendMode,
    TonClient4,
  } from "@ton/ton";
  import { elizaLogger } from "@elizaos/core";
  import { waitSeqnoContract } from "../../utils/util";
import { WalletProvider } from "../wallet";
  
  // Custom serializer for BigInt values
  const safeStringify = (obj: any) => {
    return JSON.stringify(obj, (_, value) => 
      typeof value === 'bigint' ? value.toString() : value
    );
  };
  
  // Torch Finance network configurations
  const TORCH_CONFIG = {
    mainnet: {
      factoryAddress: "", // Mainnet factory address not provided
      oracleEndpoint: "https://oracle.torch.finance",
      indexerEndpoint: "https://indexer.torch.finance/",
      apiEndpoint: "https://api.torch.finance", // Assuming API endpoint
    },
    testnet: {
      factoryAddress: "kQAEQ_tRYl3_EJXBTGIKaao0AVZ00OOYOnabhR1aEVXfSjrQ",
      oracleEndpoint: "https://testnet-oracle.torch.finance",
      indexerEndpoint: "https://testnet-indexer.torch.finance/",
      apiEndpoint: "https://testnet-api.torch.finance", // Using testnet API endpoint
    }
  };

  elizaLogger.log("TorchFinance: Configurations initialized for mainnet and testnet");
  
  // Create proper TON asset
  const TON_ASSET = Asset.ton();
  const TSTON_ADDRESS = "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav";
  const TSTON_ASSET = Asset.jetton(TSTON_ADDRESS);
  const STTON_ADDRESS = "EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k";
  const STTON_ASSET = Asset.jetton(STTON_ADDRESS);
  
  const SUPPORTED_TOKENS = [
    "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav",
    "EQDNhy-nxYFgUqzfUzImBEP67JqsyMIcyk2S5_RwNNEYku0k",
    "EQDPdq8xjAhytYqfGSX8KcFWIReCufsB9Wdg0pLlYSO_h76w",
  ];
  
  // Deprecated
  const TRITON_POOL_V2 = "EQB2iUVMu3yffZO9sAG3xadzXgdPPl43MaXK9s8Hd8xQgQFO";
  
  elizaLogger.log("TorchFinance constants initialized:", {
    supportedTokens: SUPPORTED_TOKENS,
    tritonPoolV2: TRITON_POOL_V2
  });
  
  export class TorchFinance implements DEX {
    private walletProvider: WalletProvider;
    private config: TorchSDKOptions;
    private sdk: TorchSDK;
    private network: 'mainnet' | 'testnet';
  
    supportMethods = Object.freeze([
      SupportedMethod.DEPOSIT,
      SupportedMethod.WITHDRAW,
    ]);
  
    // Send transaction with waitSeqnoContract for confirmation
    async send(args: SenderArguments | SenderArguments[]): Promise<string> {
      elizaLogger.log("TorchFinance: Preparing to send transaction");
      args = Array.isArray(args) ? args : [args];
      
      elizaLogger.log(`TorchFinance: Sending ${args.length} messages`);
      
      try {
        const walletClient = this.walletProvider.getWalletClient();
        const contract = await walletClient.open(this.walletProvider.wallet);
        const seqno = await contract.getSeqno();
        elizaLogger.log(`TorchFinance: Current wallet seqno: ${seqno}`);
        
        // Create transfer message
        const transfer = contract.createTransfer({
          seqno: seqno,
          secretKey: this.walletProvider.keypair.secretKey,
          messages: args.map((arg) => {
            elizaLogger.log(`TorchFinance: Creating message to ${arg.to.toString()} with value ${arg.value}`);
            return internal({
              to: arg.to,
              value: arg.value,
              bounce: arg.bounce,
              body: arg.body,
            });
          }),
          sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        });
        
        elizaLogger.log("TorchFinance: Transfer message created, sending to network");
        await contract.send(transfer);
        
        elizaLogger.log(`TorchFinance: Transaction sent, waiting for confirmation (seqno: ${seqno})...`);
        await waitSeqnoContract(seqno, contract);
        elizaLogger.log("TorchFinance: Transaction confirmed successfully");
        
        // Get transaction hash
        const state = await walletClient.getContractState(this.walletProvider.wallet.address);
        const txHash = state.lastTransaction?.hash || "unknown";
        elizaLogger.log(`TorchFinance: Transaction hash: ${txHash}`);
        
        return txHash;
      } catch (error) {
        elizaLogger.error("TorchFinance: Error sending transaction:", error);
        throw error;
      }
    }
  
    constructor(walletProvider: WalletProvider, network: 'mainnet' | 'testnet' = 'testnet') {
      elizaLogger.log(`TorchFinance: Initializing with wallet provider on ${network} network`);
      this.walletProvider = walletProvider;
      this.network = network;

      const networkConfig = TORCH_CONFIG[network];
      
      if (network === 'mainnet' && !networkConfig.factoryAddress) {
        elizaLogger.warn("TorchFinance: Mainnet factory address not provided, some operations may not work");
      }

      const tonClient = this.walletProvider.getWalletClient() as unknown as TonClient4;
      
      this.config = {
        tonClient: tonClient,
        factoryAddress: Address.parse(networkConfig.factoryAddress),
        oracleEndpoint: networkConfig.oracleEndpoint,
        apiEndpoint: networkConfig.apiEndpoint,
      };
      
      elizaLogger.log(`TorchFinance: Creating TorchSDK instance with ${network} config:`, {
        factoryAddress: networkConfig.factoryAddress,
        oracleEndpoint: networkConfig.oracleEndpoint,
        apiEndpoint: networkConfig.apiEndpoint
      });
      
      this.sdk = new TorchSDK(this.config);
    }
  
    getSuppotedPools() {
      elizaLogger.log("TorchFinance: Getting supported pools");
      return [TRITON_POOL_V2];
    }
  
    supportedTokens() {
      elizaLogger.log("TorchFinance: Getting supported tokens");
      return SUPPORTED_TOKENS.push("TON");
    }
    
    // Not supported
    async createPool() {
      elizaLogger.error("TorchFinance: createPool method not supported");
      throw new Error("Not Supported");
    }
  
    // Deposit tokens to liquidity pool
    // Supported pools: TRITON_V2
    async deposit(
      jettonDeposits: JettonDeposit[],
      tonAmount: number
    ): Promise<string> {
      elizaLogger.log("TorchFinance: Starting deposit operation", {
        jettonDepositsCount: jettonDeposits.length,
        tonAmount
      });
      
      try {
        // Check if tokens are supported
        for (const jettonDeposit of jettonDeposits) {
          const jettonAddress = jettonDeposit.jetton.address.toString();
          if (!SUPPORTED_TOKENS.includes(jettonAddress)) {
            const error = `Token ${jettonAddress} is not supported`;
            elizaLogger.error(`TorchFinance: ${error}`);
            throw new Error(error);
          }
          elizaLogger.log(`TorchFinance: Validated supported token: ${jettonAddress}`);
        }
        
        elizaLogger.log("TorchFinance: Generating query ID");
        const queryId = await generateQueryId();
        elizaLogger.log(`TorchFinance: Generated query ID: ${queryId}`);
        
        const LpDecimals = 18;
        // If you want to speed up the swap process, you can set the blockNumber to reduce the number of queries
        const blockNumber = 27724599;
        
        // Create an array first
        const depositAmountsArray = [];

        // Add TON if needed
        if (tonAmount) {
          elizaLogger.log(`TorchFinance: Adding TON to deposit, amount: ${tonAmount}`);
          depositAmountsArray.push({
            value: toUnit(tonAmount, 9),
            asset: TON_ASSET,
          });
        }

        // Add jettons
        for (const jettonDeposit of jettonDeposits) {
          const jettonAddress = jettonDeposit.jetton.address.toString();
          if (jettonAddress === TSTON_ADDRESS) {
            depositAmountsArray.push({
              value: toUnit(jettonDeposit.amount, 9),
              asset: TSTON_ASSET,
            });
          } else if (jettonAddress === STTON_ADDRESS) {
            depositAmountsArray.push({
              value: toUnit(jettonDeposit.amount, 9),
              asset: STTON_ASSET,
            });
          } else {
            // For other supported tokens
            depositAmountsArray.push({
              value: toUnit(jettonDeposit.amount, 9),
              asset: Asset.jetton(jettonAddress),
            });
          }
        }

        // Then assign the array to depositParams
        let depositParams: DepositParams = {
          queryId,
          pool: TRITON_POOL_V2,
          depositAmounts: depositAmountsArray,
        };
        
        elizaLogger.log("TorchFinance: Deposit parameters prepared:", safeStringify(depositParams));
        
        const sender = this.walletProvider.wallet.address;
        let senderArgs;
        
        try {
          const { result, getDepositPayload } = await this.sdk.simulateDeposit(depositParams);

          elizaLogger.log(`LP Tokens Out: ${result.lpTokenOut.toString()}`);
          elizaLogger.log(`LP Total Supply After: ${result.lpTotalSupplyAfter.toString()}`);
          elizaLogger.log(`Min LP Tokens Out: ${result.minLpTokenOut?.toString() || '(You did not specify slippage tolerance)'}`); // prettier-ignore

          elizaLogger.log(`Get ${result.lpTokenOut.toString()} LP from ${TRITON_POOL_V2}`);
          // Skip simulation as it's causing issues
          elizaLogger.log(`TorchFinance: Getting deposit payload directly for sender: ${sender.toString()}`);
          senderArgs = await getDepositPayload(sender, {
            blockNumber: blockNumber,
          });
        } catch (error) {
          elizaLogger.error("TorchFinance: Failed to generate deposit payload:", error);
          throw new Error(`Failed to generate deposit payload: ${error.message}`);
        }
        
        if (!senderArgs) {
          throw new Error("Failed to generate transaction payload");
        }
        
        elizaLogger.log("TorchFinance: Deposit payload generated, sending transaction");
        return await this.send(senderArgs);
      } catch (error) {
        elizaLogger.error("TorchFinance: Error in deposit method:", error);
        throw error;
      }
    }
  
    async withdraw(
      jettonWithdrawals: JettonWithdrawal[],
      isTon: boolean,
      amount: number
    ) {
      elizaLogger.log("TorchFinance: Starting withdraw operation", {
        jettonWithdrawalsCount: jettonWithdrawals?.length || 0,
        isTon,
        amount
      });
      
      try {
        elizaLogger.log("TorchFinance: Generating query ID");
        const queryId = await generateQueryId();
        elizaLogger.log(`TorchFinance: Generated query ID: ${queryId}`);
        
        const LpDecimals = 18;
        // If you want to speed up the swap process, you can set the blockNumber to reduce the number of queries
        const blockNumber = 27724599;
  
        let withdrawParams: WithdrawParams;
        let withdrawMode: string;
  
        // Withdraw a single asset from the pool
        if (isTon && !jettonWithdrawals) {
          withdrawMode = "Single TON";
          elizaLogger.log(`TorchFinance: Withdraw mode: ${withdrawMode}`);
          
          withdrawParams = {
            mode: "Single",
            queryId,
            pool: TRITON_POOL_V2,
            burnLpAmount: toUnit(amount, LpDecimals),
            withdrawAsset: TON_ASSET,
            slippageTolerance: 0.05, // 5% slippage tolerance
          };
        } else if (jettonWithdrawals?.length === 1) {
          withdrawMode = "Single Jetton";
          elizaLogger.log(`TorchFinance: Withdraw mode: ${withdrawMode}`);
          
          const jettonAddress = jettonWithdrawals[0].jetton.address.toString();
          elizaLogger.log(`TorchFinance: Withdrawing jetton: ${jettonAddress}`);
          
          withdrawParams = {
            mode: "Single",
            queryId,
            pool: TRITON_POOL_V2,
            burnLpAmount: toUnit(amount, LpDecimals),
            withdrawAsset: Asset.jetton(jettonAddress),
            slippageTolerance: 0.05, // 5% slippage tolerance
          };
        } else if (isTon && jettonWithdrawals?.length === 2) {
          // Withdraw all assets proportionally
          withdrawMode = "Balanced";
          elizaLogger.log(`TorchFinance: Withdraw mode: ${withdrawMode}`);
          
          withdrawParams = {
            mode: "Balanced",
            queryId,
            pool: TRITON_POOL_V2,
            burnLpAmount: toUnit(amount, LpDecimals),
            slippageTolerance: 0.05, // 5% slippage tolerance
          };
        } else {
          elizaLogger.error("TorchFinance: Invalid withdrawal configuration");
          throw new Error("Invalid withdrawal configuration");
        }
        
        elizaLogger.log("TorchFinance: Withdraw parameters prepared:", safeStringify(withdrawParams));
        
        const sender = this.walletProvider.wallet.address;
        let senderArgs;
        
        try {
          // Skip simulation as it's causing issues
          elizaLogger.log(`TorchFinance: Getting withdraw payload directly for sender: ${sender.toString()}`);
          senderArgs = await this.sdk.getWithdrawPayload(sender, withdrawParams, {
            blockNumber: blockNumber,
          });
        } catch (error) {
          elizaLogger.error("TorchFinance: Failed to generate withdraw payload:", error);
          throw new Error(`Failed to generate withdraw payload: ${error.message}`);
        }
        
        if (!senderArgs) {
          throw new Error("Failed to generate transaction payload");
        }
        
        elizaLogger.log("TorchFinance: Withdraw payload generated, sending transaction");
        return await this.send(senderArgs);
      } catch (error) {
        elizaLogger.error("TorchFinance: Error in withdraw method:", error);
        throw error;
      }
    }
  
    async claimFee() {
      elizaLogger.error("TorchFinance: claimFee method not supported");
      throw new Error("Not supported");
    }
  }