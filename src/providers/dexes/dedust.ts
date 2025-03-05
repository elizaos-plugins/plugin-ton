import {
  DEX,
  JettonDeposit,
  JettonWithdrawal,
  SupportedMethod,
  Token,
} from ".";
import {
  Factory,
  JettonRoot,
  MAINNET_FACTORY_ADDR,
  PoolType,
  ReadinessStatus,
  VaultJetton,
} from "@dedust/sdk";
import {
  JettonMaster,
  Sender,
  toNano,
  TonClient,
} from "@ton/ton";
import { Asset } from "@dedust/sdk";
import { elizaLogger } from "@elizaos/core";
import { WalletProvider } from "../wallet";
import { waitSeqnoContract } from "../../utils/util";

export class Dedust implements DEX {
  private walletProvider: WalletProvider;
  private tonClient: TonClient;
  private factory: any; // Factory instance
  private sender: Sender;

  supportMethods = Object.freeze([
    SupportedMethod.CREATE_POOL,
    SupportedMethod.DEPOSIT,
    SupportedMethod.WITHDRAW,
  ]);

  constructor(walletProvider: WalletProvider) {
    elizaLogger.log("Dedust: Initializing with wallet provider");
    this.walletProvider = walletProvider;
    
    elizaLogger.log("Dedust: Initializing with mainnet configuration");
    this.tonClient = this.walletProvider.getWalletClient();
    this.factory = this.tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    
    this.initSender();
  }

  private async initSender() {
    elizaLogger.log("Dedust: Initializing sender");
    try {
      const wallet = this.tonClient.open(this.walletProvider.wallet);
      this.sender = wallet.sender(this.walletProvider.keypair.secretKey);
      elizaLogger.log(`Dedust: Sender initialized with address: ${this.walletProvider.wallet.address.toString()}`);
    } catch (error) {
      elizaLogger.error("Dedust: Error initializing sender:", error);
      throw error;
    }
  }

  async createPool(jettons: JettonMaster[]) {
    elizaLogger.log("Dedust: Creating pool with jettons:", jettons.map(j => j.address.toString()));
    
    try {
      // Ensure sender is initialized
      if (!this.sender) {
        await this.initSender();
      }
      
      const isTon = jettons.length === 1;
      elizaLogger.log(`Dedust: Pool type: ${isTon ? 'TON + Jetton' : 'Jetton + Jetton'}`);

      const assets: [Asset, Asset] = [
        isTon ? Asset.native() : Asset.jetton(jettons[0].address),
        Asset.jetton(jettons[isTon ? 0 : 1].address),
      ];
      
      elizaLogger.log(`Dedust: Assets: ${assets[0].toString()}, ${assets[1].toString()}`);

      // Get pool
      elizaLogger.log("Dedust: Checking if pool exists");
      const pool = this.tonClient.open(
        await this.factory.getPool(PoolType.VOLATILE, assets)
      );
      
      elizaLogger.log(`Dedust: Pool address: ${pool.address.toString()}`);

      // Check if pool exists
      const poolReadiness = await pool.getReadinessStatus();
      elizaLogger.log(`Dedust: Pool readiness status: ${poolReadiness}`);
      
      if (poolReadiness === ReadinessStatus.READY) {
        elizaLogger.log("Dedust: Pool already exists");
        return false;
      }

      // If pool does not exists we have to
      // 1. Create vaults for each jetton if it doesn't exists
      // 2. Create the pool

      // Check if vaults exists for jettons
      elizaLogger.log("Dedust: Checking if vaults exist for jettons");
      const hasVaults = await Promise.all(
        jettons.map(async (jetton, index) => {
          const hasVault = await !!this.factory.getJettonVault(jetton.address);
          elizaLogger.log(`Dedust: Vault for jetton ${index + 1} exists: ${hasVault}`);
          return hasVault;
        })
      );

      // Create vault if not existent
      elizaLogger.log("Dedust: Creating vaults if needed");
      const vaultTxHashes = [];
      
      for (const jetton of jettons) {
        const index = jettons.indexOf(jetton);
        if (hasVaults[index]) {
          elizaLogger.log(`Dedust: Vault for jetton ${index + 1} already exists, skipping creation`);
          continue;
        }
        
        elizaLogger.log(`Dedust: Creating vault for jetton ${index + 1}: ${jetton.address.toString()}`);
        const txHash = await this.factory.sendCreateVault(this.sender, {
          asset: Asset.jetton(jetton.address),
        });
        vaultTxHashes.push(txHash);
        elizaLogger.log(`Dedust: Vault creation initiated for jetton ${index + 1}, txHash: ${txHash}`);
      }

      // Create pool if not deployed
      if (poolReadiness === ReadinessStatus.NOT_DEPLOYED) {
        elizaLogger.log("Dedust: Creating volatile pool");
        try {
          const txHash = await this.factory.sendCreateVolatilePool(this.sender, {
            assets,
          });
          elizaLogger.log(`Dedust: Pool creation initiated, txHash: ${txHash}`);
          return txHash;
        } catch (error) {
          elizaLogger.error("Dedust: Error creating pool:", error);
          return false;
        }
      }
      
      return vaultTxHashes.length > 0 ? vaultTxHashes[0] : true;
    } catch (error) {
      elizaLogger.error("Dedust: Error in createPool method:", error);
      throw error;
    }
  }

  async deposit(
    jettonDeposits: JettonDeposit[],
    tonAmount: number,
    params: {
      slippageTolerance?: number;
    } = {}
  ) {
    elizaLogger.log("Dedust: Starting deposit operation", {
      jettonDepositsCount: jettonDeposits.length,
      tonAmount,
      slippageTolerance: params.slippageTolerance
    });
    
    try {
      // Ensure sender is initialized
      if (!this.sender) {
        await this.initSender();
      }
      
      // Check if pool exists
      elizaLogger.log("Dedust: Checking if pool exists");
      const pool = await this.getPool(jettonDeposits.map((jd) => jd.jetton));
      if (!pool) {
        const error = "No such pool";
        elizaLogger.error(`Dedust: ${error}`);
        throw new Error(error);
      }
      elizaLogger.log(`Dedust: Pool found: ${pool.address.toString()}`);

      const isTon = jettonDeposits.length === 1;
      elizaLogger.log(`Dedust: Deposit type: ${isTon ? 'TON + Jetton' : 'Jetton + Jetton'}`);

      // Prepare assets
      const assets: [Asset, Asset] = [
        isTon ? Asset.native() : Asset.jetton(jettonDeposits[0].jetton.address),
        Asset.jetton(jettonDeposits[isTon ? 0 : 1].jetton.address),
      ];
      
      elizaLogger.log(`Dedust: Assets: ${assets[0].toString()}, ${assets[1].toString()}`);

      // Prepare balances to deposit
      const targetBalances: [bigint, bigint] = [
        toNano(isTon ? tonAmount : jettonDeposits[0].amount),
        toNano(jettonDeposits[isTon ? 0 : 1].amount),
      ];
      
      elizaLogger.log(`Dedust: Target balances: ${targetBalances[0].toString()}, ${targetBalances[1].toString()}`);

      let txHashes = [];

      if (isTon) {
        // Deposit ton to pool
        elizaLogger.log(`Dedust: Depositing TON (${tonAmount}) to pool`);
        const TON = Asset.native();
        const tonVault = this.tonClient.open(await this.factory.getNativeVault());
        
        elizaLogger.log(`Dedust: TON vault address: ${tonVault.address.toString()}`);

        const depositPayload = VaultJetton.createDepositLiquidityPayload({
          poolType: PoolType.VOLATILE,
          assets,
          targetBalances,
        });
        
        // Use the sender to send the transaction
        const txHash = await this.sender.send({
          to: tonVault.address,
          value: toNano(tonAmount),
          body: depositPayload
        });
        
        txHashes.push(txHash);
        elizaLogger.log(`Dedust: TON deposit initiated, txHash: ${txHash}`);
      }

      // Deposit either a single or two jettons to a pool
      elizaLogger.log(`Dedust: Depositing ${jettonDeposits.length} jettons to pool`);
      
      for (const jettonDeposit of jettonDeposits) {
        const fee = 0.1;
        const asset = Asset.jetton(jettonDeposit.jetton.address);
        elizaLogger.log(`Dedust: Processing jetton: ${jettonDeposit.jetton.address.toString()}, amount: ${jettonDeposit.amount}`);
        
        const assetContract = this.tonClient.open(
          JettonRoot.createFromAddress(jettonDeposit.jetton.address)
        );
        
        const assetVault = this.tonClient.open(
          await this.factory.getJettonVault(asset.address)
        );
        elizaLogger.log(`Dedust: Jetton vault address: ${assetVault.address.toString()}`);
        
        const assetWallet = this.tonClient.open(
          await assetContract.getWallet(this.sender.address)
        );
        elizaLogger.log(`Dedust: Jetton wallet address: ${assetWallet.address.toString()}`);
        
        elizaLogger.log(`Dedust: Transferring ${jettonDeposit.amount} jettons to vault`);
        
        // Use sendTransfer directly with the sender
        const txHash = await assetWallet.sendTransfer(
          this.sender,
          toNano(0.1), // Gas for the operation
          {
            amount: toNano(jettonDeposit.amount),
            destination: assetVault.address,
            responseAddress: this.sender.address,
            forwardAmount: toNano(jettonDeposit.amount - fee),
            forwardPayload: VaultJetton.createDepositLiquidityPayload({
              poolType: PoolType.VOLATILE,
              assets,
              targetBalances,
            }),
          }
        );
        
        txHashes.push(txHash);
        elizaLogger.log(`Dedust: Jetton transfer initiated, txHash: ${txHash}`);
      }
      
      elizaLogger.log(`Dedust: All deposit operations initiated with txHashes: ${txHashes.join(', ')}`);
      return txHashes[0]; // Return the first hash for compatibility
    } catch (error) {
      elizaLogger.error("Dedust: Error in deposit method:", error);
      throw error;
    }
  }

  async withdraw(
    jettonWithdrawals: JettonWithdrawal[],
    isTon: boolean,
    amount: number,
    params: {} = {}
  ) {
    elizaLogger.log("Dedust: Starting withdraw operation", {
      jettonWithdrawalsCount: jettonWithdrawals?.length || 0,
      isTon,
      amount
    });
    
    try {
      // Ensure sender is initialized
      if (!this.sender) {
        await this.initSender();
      }
      
      const assets: [Asset, Asset] = [
        isTon
          ? Asset.native()
          : Asset.jetton(jettonWithdrawals[0].jetton.address),
        Asset.jetton(jettonWithdrawals[isTon ? 0 : 1].jetton.address),
      ];
      
      elizaLogger.log(`Dedust: Assets: ${assets[0].toString()}, ${assets[1].toString()}`);

      // Get the wallet
      elizaLogger.log("Dedust: Getting pool for withdraw");
      const pool = this.tonClient.open(
        await this.factory.getPool(PoolType.VOLATILE, assets)
      );
      elizaLogger.log(`Dedust: Pool address: ${pool.address.toString()}`);
      
      const lpWallet = this.tonClient.open(await pool.getWallet(this.sender.address));
      elizaLogger.log(`Dedust: LP wallet address: ${lpWallet.address.toString()}`);
      
      const lpBalance = await lpWallet.getBalance();
      elizaLogger.log(`Dedust: LP wallet balance: ${lpBalance.toString()}`);
      
      const burnAmount = toNano(amount);
      elizaLogger.log(`Dedust: Burning ${amount} LP tokens (${burnAmount.toString()})`);

      // Use sendBurn directly with the sender
      const txHash = await lpWallet.sendBurn(
        this.sender, 
        burnAmount, 
        {
          amount: lpBalance,
        }
      );
      
      elizaLogger.log(`Dedust: LP token burn initiated, txHash: ${txHash}`);
      return txHash;
    } catch (error) {
      elizaLogger.error("Dedust: Error in withdraw method:", error);
      throw error;
    }
  }

  // Pools can either be 2 jettons or TON and a jetton
  async getPool(jettons: JettonMaster[]) {
    elizaLogger.log("Dedust: Getting pool for jettons:", jettons.map(j => j.address.toString()));
    
    const isTon = jettons.length === 1;
    elizaLogger.log(`Dedust: Pool type: ${isTon ? 'TON + Jetton' : 'Jetton + Jetton'}`);

    const assets: [Asset, Asset] = [
      isTon ? Asset.native() : Asset.jetton(jettons[0].address),
      Asset.jetton(jettons[isTon ? 0 : 1].address),
    ];
    
    elizaLogger.log(`Dedust: Assets: ${assets[0].toString()}, ${assets[1].toString()}`);

    try {
      const pool = await this.factory.getPool(PoolType.VOLATILE, assets);
      elizaLogger.log(`Dedust: Pool found: ${pool.address.toString()}`);
      return pool;
    } catch (error) {
      elizaLogger.error("Dedust: Error getting pool:", error);
      return undefined;
    }
  }
}