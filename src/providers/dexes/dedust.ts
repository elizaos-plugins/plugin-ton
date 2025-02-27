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
  TonClient4,
  WalletContractV3R2,
} from "@ton/ton";
import { Asset } from "@dedust/sdk";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { IAgentRuntime } from "@elizaos/core";
import { CONFIG_KEYS } from "../../enviroment";

const tonClient = new TonClient4({
  endpoint: "https://mainnet-v4.tonhubapi.com",
  // endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
});
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

export class Dedust implements DEX {
  sender: Sender;

  supportMethods = Object.freeze([
    SupportedMethod.CREATE_POOL,
    SupportedMethod.DEPOSIT,
    SupportedMethod.WITHDRAW,
  ]);

  async init(runtime: IAgentRuntime) {
    const privateKey = process.env.TON_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(`${CONFIG_KEYS.TON_PRIVATE_KEY} is missing`);
    }
    const mnemonic = privateKey.split(" ");

    const keys = await mnemonicToPrivateKey(mnemonic);
    const wallet = tonClient.open(
      WalletContractV3R2.create({
        workchain: 0,
        publicKey: keys.publicKey,
      })
    );

    this.sender = wallet.sender(keys.secretKey);
  }

  async createPool(jettons: JettonMaster[]) {
    console.log(await factory.getNativeVault());
    return
    const isTon = jettons.length === 1;

    const assets: [Asset, Asset] = [
      isTon ? Asset.native() : Asset.jetton(jettons[0].address),
      Asset.jetton(jettons[isTon ? 0 : 1].address),
    ];

    // Get pool
    const pool = tonClient.open(
      await factory.getPool(PoolType.VOLATILE, assets)
    );

    // Check if pool exists
    const poolReadiness = await pool.getReadinessStatus();
    if (poolReadiness === ReadinessStatus.READY) {
      console.log("Pool already exists");
      return false;
    }

    // If pool does not exists we have to
    // 1. Create vaults for each jetton if it doesn't exists
    // 2. Create the pool

    // Check if vaults exists for jettons
    const hasVaults = await Promise.all(
      jettons.map(
        async (jetton) => await !!factory.getJettonVault(jetton.address)
      )
    );

    // Create vault if not existent
    await Promise.all(
      jettons.map(async (jetton, index) => {
        if (hasVaults[index]) return;
        await factory.sendCreateVault(this.sender, {
          asset: Asset.jetton(jetton[0].address),
        });
      })
    );

    // Create pool if not deployed
    if (poolReadiness === ReadinessStatus.NOT_DEPLOYED) {
      try {
        await factory.sendCreateVolatilePool(this.sender, {
          assets,
        });
      } catch (error) {
        return false;
      }
    }
    return true;
  }

  async deposit(
    jettonDeposits: JettonDeposit[],
    tonAmount: number,
    params: {
      slippageTolerance?: number;
    }
  ) {
    // Check if pool exists
    const pool = await this.getPool(jettonDeposits.map((jd) => jd.jetton));
    if (!pool) {
      console.log("No such pool");
      return false;
    }

    const isTon = jettonDeposits.length === 1;

    // Prepare assets
    const assets: [Asset, Asset] = [
      isTon ? Asset.native() : Asset.jetton(jettonDeposits[0].jetton.address),
      Asset.jetton(jettonDeposits[isTon ? 0 : 1].jetton.address),
    ];

    // Prepare balances to deposit
    const targetBalances: [bigint, bigint] = [
      toNano(isTon ? tonAmount : jettonDeposits[0].amount),
      toNano(jettonDeposits[isTon ? 0 : 1].amount),
    ];

    if (isTon) {
      // Deposit ton to pool
      // The other array will only contain a single jetton
      const TON = Asset.native();
      const tonVault = tonClient.open(await factory.getNativeVault());

      await tonVault.sendDepositLiquidity(this.sender, {
        poolType: PoolType.VOLATILE,
        assets,
        targetBalances,
        amount: toNano(tonAmount),
      });
    }

    // Deposit either a single or two jettons to a pool
    await Promise.all(
      jettonDeposits.map(async (jettonDeposit) => {
        const fee = 0.1;
        const asset = Asset.jetton(jettonDeposit.jetton.address);
        const assetContract = tonClient.open(
          JettonRoot.createFromAddress(jettonDeposit.jetton.address)
        );

        const assetVault = tonClient.open(
          await factory.getJettonVault(asset.address)
        );
        const assetWallet = tonClient.open(
          await assetContract.getWallet(this.sender.address)
        );

        await assetWallet.sendTransfer(
          this.sender,
          toNano(jettonDeposit.amount),
          {
            amount: toNano(jettonDeposit.amount),
            destination: assetVault.address,
            responseAddress: this.sender.address,
            // Forward (amount-fee) to pool
            forwardAmount: toNano(jettonDeposit.amount - fee),
            forwardPayload: VaultJetton.createDepositLiquidityPayload({
              poolType: PoolType.VOLATILE,
              assets,
              targetBalances,
            }),
          }
        );
      })
    );
  }

  async withdraw(
    jettonWithdrawals: JettonWithdrawal[],
    isTon: boolean,
    amount: number,
    params: {}
  ) {
    const assets: [Asset, Asset] = [
      isTon
        ? Asset.native()
        : Asset.jetton(jettonWithdrawals[0].jetton.address),
      Asset.jetton(jettonWithdrawals[isTon ? 0 : 1].jetton.address),
    ];

    // Get the wallet
    const pool = tonClient.open(
      await factory.getPool(PoolType.VOLATILE, assets)
    );
    const lpWallet = tonClient.open(await pool.getWallet(this.sender.address));

    // Burn LP tokens to withdraw liquidity
    await lpWallet.sendBurn(this.sender, toNano(amount), {
      amount: await lpWallet.getBalance(),
    });
  }

  // Pools can either be 2 jettons or TON and a jetton
  async getPool(jettons: JettonMaster[]) {
    const isTon = jettons.length === 1;

    const assets: [Asset, Asset] = [
      isTon ? Asset.native() : Asset.jetton(jettons[0].address),
      Asset.jetton(jettons[isTon ? 0 : 1].address),
    ];

    try {
      return await factory.getPool(PoolType.VOLATILE, assets);
    } catch (error) {
      //   console.log(error);
      return;
    }
  }
}
