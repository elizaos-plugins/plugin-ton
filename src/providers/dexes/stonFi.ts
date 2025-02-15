import { JettonMaster, SenderArguments, toNano, TonClient } from "@ton/ton";
import {
  JettonDeposit,
  DEX,
  Token,
  JettonWithdrawal,
  SupportedMethod,
} from "./dex";
import { pTON, DEX as StonFiDEX } from "@ston-fi/sdk";

const client = new TonClient({
  endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
});

const router = client.open(
  StonFiDEX.v2_1.Router.create(
    "kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v" // CPI Router v2.1.0
  )
);

export class StonFi implements DEX {
  wallet: any;

  supportMethods = Object.freeze([
    SupportedMethod.CREATE_POOL,
    SupportedMethod.DEPOSIT,
    SupportedMethod.WITHDRAW,
  ]);

  constructor(wallet) {
    this.wallet = wallet;
  }

  async createPool(jettons: JettonMaster[]) {}

  // NOTE If jettonDeposits.length === 2 we deposit into a Jetton/Jetton pool
  // If jettonDeposits.length === 1 we deposit into a TON/Jetton pool
  // If jettonDepoists[i].amount === 0 we don't deposit jetton
  // If tonAmount === 0 we don't deposit TON
  // Either jettonDeposits.length === 2 or tonAmount !== 0
  async deposit(jettonDeposits: JettonDeposit[], tonAmount?: number) {
    if (jettonDeposits.length === 1 && !tonAmount) {
      console.log("Wrong inputs");
      return false;
    }

    let txParams;

    // Jetton/Jetton
    if (jettonDeposits.length === 2) {
      // Single deposit
      if (jettonDeposits.filter((dep) => !!!dep.amount).length === 2) {
        txParams = await router.getSingleSideProvideLiquidityJettonTxParams({
          userWalletAddress: this.wallet.address,
          sendTokenAddress:
            jettonDeposits[0].amount > 0
              ? jettonDeposits[0].jetton.address
              : jettonDeposits[1].jetton.address,
          sendAmount: toNano("1"),
          otherTokenAddress:
            jettonDeposits[0].amount > 0
              ? jettonDeposits[1].jetton.address
              : jettonDeposits[0].jetton.address,
          minLpOut: "1",
          queryId: 123456,
        });
      } else {
        // Deposit both Jettons
        txParams = await Promise.all([
          jettonDeposits.map((jettonDeposit, index) => {
            return router.getProvideLiquidityJettonTxParams({
              userWalletAddress: this.wallet.address,
              sendTokenAddress: jettonDeposit.jetton.address,
              sendAmount: toNano(jettonDeposit.amount),
              otherTokenAddress: jettonDeposits[(index + 1) % 2].jetton.address,
              minLpOut: "1",
              queryId: +`12345${index ?? "6"}`,
            });
          }),
        ]);
      }
    } else {
      // TON/Jetton
      const proxyTon = pTON.v2_1.create(
        "kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px" // pTON v2.1.0
      );
      // Deposit both TON and Jetton
      if (tonAmount > 0 && jettonDeposits[0].amount > 0) {
        txParams = await Promise.all([
          // deposit 1 TON to the TON/TestRED pool and get at least 1 nano LP token
          router.getProvideLiquidityTonTxParams({
            userWalletAddress: this.wallet.address,
            proxyTon,
            sendAmount: toNano(tonAmount),
            otherTokenAddress: jettonDeposits[0].jetton.address,
            minLpOut: "1",
            queryId: 12345,
          }),
          // deposit 1 TestRED to the TON/TestRED pool and get at least 1 nano LP token
          router.getProvideLiquidityJettonTxParams({
            userWalletAddress: this.wallet.address,
            sendTokenAddress: jettonDeposits[0].jetton.address,
            sendAmount: toNano(jettonDeposits[0].amount),
            otherTokenAddress: proxyTon.address,
            minLpOut: "1",
            queryId: 123456,
          }),
        ]);
      } else {
        if (tonAmount) {
          // Deposit only TON
          txParams = await router.getSingleSideProvideLiquidityTonTxParams({
            userWalletAddress: this.wallet.address,
            proxyTon,
            sendAmount: toNano(tonAmount),
            otherTokenAddress: jettonDeposits[0].jetton.address,
            minLpOut: "1",
            queryId: 12345,
          });
        } else {
          // Deposit only Jetton
          txParams = await router.getSingleSideProvideLiquidityTonTxParams({
            userWalletAddress: this.wallet.address,
            proxyTon,
            sendAmount: toNano(jettonDeposits[0].amount),
            otherTokenAddress: proxyTon.address,
            minLpOut: "1",
            queryId: 12345,
          });
        }
      }
    }

    if (txParams.length && txParams.length > 0) {
      txParams.map(async (txParam) => {
        await this.sendTransaction(txParam);
      });
    } else {
      await this.sendTransaction(txParams);
    }

    return true;
  }

  async withdraw(
    jettonWithdrawals: JettonWithdrawal[],
    isTon: boolean,
    amount: number
  ) {
    const proxyTon = pTON.v2_1.create(
      "kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px"
    );
    const assets: [string, string] = [
      isTon
        ? proxyTon.address.toString()
        : jettonWithdrawals[0].jetton.address.toString(),
      jettonWithdrawals[isTon ? 0 : 1].jetton.address.toString(),
    ];
    const pool = client.open(
      await router.getPool({
        token0: assets[0],
        token1: assets[1],
      })
    );

    const lpWallet = client.open(
      await pool.getJettonWallet({
        ownerAddress: this.wallet.address,
      })
    );

    const lpWalletData = await lpWallet.getWalletData();

    const txParams = await pool.getBurnTxParams({
      amount: amount ?? lpWalletData.balance,
      userWalletAddress: this.wallet.address,
      queryId: 12345,
    });

    await this.sendTransaction(txParams);

    return true;
  }

  async claimFee(params: { jettons; isTon }) {
    // Prepare tokens to claim fee from
    const tokens = params.jettons.map((jetton) => jetton.address.toString());
    if (params.isTon) {
      tokens.push("kQDLvsZol3juZyOAVG8tWsJntOxeEZWEaWCbbSjYakQpuYN5");
    }

    // Create vaults
    const vaults = await Promise.all(
      tokens.map(async (token) => {
        client.open(
          await router.getVault({
            tokenMinter: token,
            user: this.wallet.address,
          })
        );
      })
    );

    // Withdraw fees
    const txParams = await Promise.all(
      vaults.map(async (vault) => {
        return await vault.getWithdrawFeeTxParams({
          queryId: 12345,
        });
      })
    );

    await Promise.all(
      txParams.map(async (txParam) => {
        await this.sendTransaction(txParam);
      })
    );
  }

  private async sendTransaction(args: SenderArguments) {}
}
