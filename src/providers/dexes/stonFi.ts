import {
  internal,
  JettonMaster,
  SenderArguments,
  toNano,
  TonClient,
  WalletContractV4,
} from "@ton/ton";
import {
  JettonDeposit,
  DEX,
  Token,
  JettonWithdrawal,
  SupportedMethod,
} from ".";
import { pTON, DEX as StonFiDEX } from "@ston-fi/sdk";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletProvider } from "../wallet";

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

  constructor(wallet: WalletProvider) {
    this.wallet = wallet;
  }

  // To create a new Pool, just provide the minimum amount of liquidity to pair (1001 Jettons).
  // A basic amount of 1001 lp tokens will be reserved on pool on initial liquidity deposit with the rest going to the user.
  async createPool(jettons: JettonMaster[]) {
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
    if (jettonDeposits.length === 1 && !tonAmount) {
      console.log("Wrong inputs");
      return false;
    }

    let txParams;

    // Jetton/Jetton
    if (jettonDeposits.length === 2) {
      // Single deposit
      if (jettonDeposits.filter((dep) => !!!dep.amount).length === 2) {
        txParams =
          await await router.getSingleSideProvideLiquidityJettonTxParams({
            userWalletAddress: this.wallet.getAddress(),
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
          jettonDeposits.map(async (jettonDeposit, index) => {
            return await router.getProvideLiquidityJettonTxParams({
              userWalletAddress: this.wallet.getAddress(),
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
      if (tonAmount > 0 && jettonDeposits[0]?.amount > 0) {
        txParams = await Promise.all([
          // deposit 1 TON to the TON/TestRED pool and get at least 1 nano LP token
          await router.getProvideLiquidityTonTxParams({
            userWalletAddress: this.wallet.getAddress(),
            proxyTon,
            sendAmount: toNano(tonAmount),
            otherTokenAddress: jettonDeposits[0].jetton.address,
            minLpOut: "1",
            queryId: 12345,
          }),
          // deposit 1 TestRED to the TON/TestRED pool and get at least 1 nano LP token
          await router.getProvideLiquidityJettonTxParams({
            userWalletAddress: this.wallet.getAddress(),
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
            userWalletAddress: this.wallet.getAddress(),
            proxyTon,
            sendAmount: toNano(tonAmount),
            otherTokenAddress: jettonDeposits[0].jetton.address.toString(),
            minLpOut: "1",
            queryId: 12345,
          });
        } else {
          // Deposit only Jetton
          txParams = await router.getSingleSideProvideLiquidityTonTxParams({
            userWalletAddress: this.wallet.getAddress(),
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

  private async sendTransaction(txParams: SenderArguments) {
    const privateKey = process.env.TON_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(`Private key is missing`);
    }
    const mnemonics = privateKey.split(" ");
    const keyPair = await mnemonicToPrivateKey(mnemonics);

    const workchain = 0;
    const wallet = WalletContractV4.create({
      workchain,
      publicKey: keyPair.publicKey,
    });

    const contract = client.open(wallet);

    await contract.sendTransfer({
      seqno: await contract.getSeqno(),
      secretKey: keyPair.secretKey,
      messages: [internal(txParams)],
    });
  }
}
