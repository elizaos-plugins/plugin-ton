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
  OpenedContract,
  SenderArguments,
  SendMode,
  TonClient4,
  WalletContractV5R1,
} from "@ton/ton";
import { IAgentRuntime } from "@elizaos/core";
import { CONFIG_KEYS } from "../../enviroment";
import { KeyPair, mnemonicToWalletKey } from "@ton/crypto";

const tonClient = new TonClient4({
  endpoint: "https://testnet-v4.tonhubapi.com/",
});
const factoryAddress = Address.parse(
  "kQAEQ_tRYl3_EJXBTGIKaao0AVZ00OOYOnabhR1aEVXfSjrQ"
);
const testnetOracle = "https://testnet-oracle.torch.finance";
const testnetAPI = "https://testnet-api.torch.finance";
const config: TorchSDKOptions = {
  tonClient: tonClient,
  factoryAddress: factoryAddress,
  oracleEndpoint: testnetOracle,
  apiEndpoint: testnetAPI,
};

const sdk = new TorchSDK(config);

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
const TRITON_POOL_V1 = "EQDTvrxTLp9yKHpsAtcXkJGno_d9HYw62yaWpghlFhDUNQPJ";
const TRITON_POOL_V2 = "EQA4r_ieO3vJjsQtakcFu-iHpT1LFxdZkwV8yqNNElSmUW45";

export class TorchFinance implements DEX {
  private wallet: OpenedContract<WalletContractV5R1>;
  private keyPair: KeyPair;

  supportMethods = Object.freeze([
    SupportedMethod.DEPOSIT,
    SupportedMethod.WITHDRAW,
  ]);

  // Send transaction
  async send(args: SenderArguments | SenderArguments[]) {
    args = Array.isArray(args) ? args : [args];
    // Create transfer message
    const msg = this.wallet.createTransfer({
      seqno: await this.wallet.getSeqno(),
      secretKey: this.keyPair.secretKey,
      messages: args.map((arg) => {
        return internal({
          to: arg.to,
          value: arg.value,
          body: arg.body,
        });
      }),
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      timeout: Math.floor(Date.now() / 1000) + 60,
    });
    return await this.wallet.send(msg);
  }

  constructor(wallet) {
    this.wallet = wallet;
    const privateKey = process.env.TON_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(`${CONFIG_KEYS.TON_PRIVATE_KEY} is missing`);
    }
    const mnemonics = privateKey.split(" ");
    if (mnemonics.length < 2) {
      throw new Error(`${CONFIG_KEYS.TON_PRIVATE_KEY} mnemonic seems invalid`);
    }

    mnemonicToWalletKey(mnemonics, "").then((keyPair) => {
      this.keyPair = keyPair;
    });
  }

  getSuppotedPools() {
    return [TRITON_POOL_V2];
  }

  supportedTokens() {
    return SUPPORTED_TOKENS.push("TON");
  }

  // Not supported
  async createPool() {
    throw new Error("Not Supported");
  }

  // Deposit tokens to liquidity pool
  // Supported pools: TRITON_V2
  async deposit(
    jettonDeposits: JettonDeposit[],
    tonAmount: number,
    params: {
      slippageTolerance?: number;
      pool?: string | Address;
    }
  ) {
    const { slippageTolerance, pool } = params;
    const isTon = jettonDeposits.length === 1;

    const queryId = await generateQueryId();
    jettonDeposits.forEach((asset) => {
      if (!SUPPORTED_TOKENS.includes(asset.jetton.address.toString())) {
        throw new Error("Unsupported asset");
      }
    });

    let depositAmounts = [];

    if (isTon) {
      depositAmounts.push({
        asset: TSTON_ASSET,
        value: tonAmount,
      });
    }

    jettonDeposits.map((asset) => {
      depositAmounts.push({
        asset:
          asset.jetton.address.toString() === STTON_ADDRESS
            ? STTON_ASSET
            : TSTON_ASSET,
        value: toUnit(asset.amount, 9),
      });
    });

    const depositParams: DepositParams = {
      queryId,
      pool: pool ?? TRITON_POOL_V2,
      depositAmounts,
      slippageTolerance: slippageTolerance ?? 0.01,
    };

    const { result, getDepositPayload } = await sdk.simulateDeposit(
      depositParams
    );

    const sender = this.wallet.address;
    const senderArgs = await getDepositPayload(sender, {
      ...depositParams,
      blockNumber: 27724599,
    });

    return await this.send(senderArgs);
  }

  async withdraw(
    jettonWithdrawals: JettonWithdrawal[],
    isTon: boolean,
    amount: number
  ) {
    const queryId = await generateQueryId();
    const LpDecimals = 18;
    // If you want to speed up the swap process, you can set the blockNumber to reduce the number of queries
    const blockNumber = 27724599;

    let withdrawParams: WithdrawParams;

    // Withdraw a single asset from the pool
    if (isTon && !jettonWithdrawals) {
      withdrawParams = {
        mode: "Single",
        queryId,
        pool: TRITON_POOL_V2,
        burnLpAmount: toUnit(amount, LpDecimals),
        withdrawAsset: TON_ASSET,
      };
    }
    if (jettonWithdrawals.length === 1) {
      withdrawParams = {
        mode: "Single",
        queryId,
        pool: TRITON_POOL_V2,
        burnLpAmount: toUnit(amount, LpDecimals),
        withdrawAsset: Asset.jetton(jettonWithdrawals[0].jetton.address),
      };
    }

    // Withdraw all assets proportionally
    if (isTon && jettonWithdrawals.length === 2) {
      withdrawParams = {
        mode: "Balanced",
        queryId,
        pool: TRITON_POOL_V2,
        burnLpAmount: toUnit(amount, LpDecimals),
      };
    }

    // Simulate the transaction
    const { result, getWithdrawPayload } = await sdk.simulateWithdraw(
      withdrawParams
    );

    const sender = this.wallet.address;
    const senderArgs = await getWithdrawPayload(sender, {
      blockNumber: blockNumber,
    });

    return await this.send(senderArgs);
  }

  async claimFee() {
    throw new Error("Not supported");
  }
}
