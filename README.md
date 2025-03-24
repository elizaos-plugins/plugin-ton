# @elizaos/plugin-ton

A plugin for handling TON (The Open Network) blockchain operations, providing wallet management and transfer capabilities.

## Overview

This plugin provides functionality to:

- Manage TON wallets and key derivation
- Execute secure token transfers
- Query wallet balances and portfolio information
- Format and cache transaction data
- Interface with TON blockchain via RPC endpoints
- Connect TON wallets using TonConnect protocol
- Execute secure token transfers
- Query wallet connection status
- Support multiple wallet applications (like Tonkeeper)
- Support QR Code scanning connection
- Query information for assets from Ston.fi DEX
- Swap tokens using Ston.fi DEX

### Screenshot

#### Transfer TON
![ton transfer](./screenshot/transfer.png "Transfer TON")

#### Transfer Jetton
![jetton transfer](./screenshot/jetton-transfer.png "Transfer Jetton")

#### NFT Transfer
![nft transfer](./screenshot/nft-transfer.png "NFT Transfer")

#### Batch Transfer (Jetton and TON)
![jetton and ton transfer](./screenshot/ton-jetton-batch-transfer.png "Transfer Jetton and TON")

#### Connect with TonConnect QR Code
![](./screenshot/connect.png "Connect with TonConnect QR Code")

#### TonConnect Status
![connection status](./screenshot/status.png "TonConnect Status")

#### Disconnect
![disconnect](./screenshot/disconnect.png "Disconnect")

#### NFT Transfer
![nft transfer](./screenshot/nft-transfer.png "NFT Transfer")

#### NFT Mint
![nft mint](./screenshot/mint.png "NFT Mint")

#### NFT Collection Data
![nft collection data](./screenshot/get-colleciton-data.png "NFT Collection Data")

#### Lending Info for TON
![lending](./screenshot/lending_info.png "Get lending info for TON")

#### NFT Listing and Cancellation
![nft listing and cancellation](./screenshot/nft-listing-and-cancel.png "NFT Listing Creation and Cancellation")

#### NFT Auction Creation
![auction creation](./screenshot/nft-auction.png "NFT Auction Creation")

#### NFT Bidding and Buying
![bidding and buying](./screenshot/nft-bid-and-buy.png "NFT Bidding and Buying")

#### SWAP with STON
##### Start SWAP | in between query of pending swap information | Finish swap
![STON swap confirmed](./screenshot/ston-swap-confirmed.png "Swap with STON confirmed")

##### Start SWAP | Cancel swap
![STON swap cancelled](./screenshot/ston-swap-cancelled.png "Swap with STON cancelled")

### Quick Start

```bash
# you should read the debug.sh first!

# if not provide the apikey, the response may very slow
export OPENAI_API_KEY=""

# if not provide the testnet apikey, the transfer action may not stable
# from https://t.me/toncenter to get your testnet apikey
export TON_RPC_API_KEY=""

# nvm use 23 && npm install -g pnpm
bash ./packages/plugin-ton/scripts/debug.sh
```

## Installation

```bash
npm install @elizaos/plugin-ton
```

## Configuration

The plugin requires the following environment variables:

```env
# Ton
TON_PRIVATE_KEY= # Ton Mnemonic Seed Phrase Join With " "(single space) String
TON_RPC_URL=     # ton rpc - Defaults to https://toncenter.com/api/v2/jsonRPC
TON_RPC_API_KEY= # ton rpc api key
TON_MANIFEST_URL=your_manifest_url  # Required - TonConnect manifest URL
TON_BRIDGE_URL=your_bridge_url  # Optional - defaults to https://bridge.tonapi.io/bridge

# STON.fi - Values are not required, they allow using newer versions of STON.fi DEX
# Identifies mainnet / testnet from TON_RPC_URL
STON_API_BASE_URL= # By default, uses null value (i.e. standard STON value)
STON_ROUTER_VERSION= # By default, uses v1 for mainnet and v2_1 for testnet
STON_ROUTER_ADDRESS= # By default, uses standard values
STON_PROXY_VERSION= # By default, uses v1 for mainnet and v2_1 for testnet
STON_PROXY_ADDRESS= # By default, uses standard values
```

## Usage

Import and register the plugin in your Eliza configuration:

```typescript
import { tonPlugin } from "@elizaos/plugin-ton";

export default {
  plugins: [tonPlugin],
  // ... other configuration
};
```

## Core Features

### Wallet Management

#### WalletProvider

The `WalletProvider` manages wallet operations and portfolio tracking:

```typescript
import { WalletProvider } from "@elizaos/plugin-ton";

// Initialize the provider
const provider = await initWalletProvider(runtime);

// Get wallet balance
const balance = await provider.getWalletBalance();

// Get formatted portfolio
const portfolio = await provider.getFormattedPortfolio(runtime);

// Get wallet client for contract interactions
const client = provider.getWalletClient();

// Get wallet address
const address = provider.getAddress();
```

#### Create Ton Wallet

Create a new TON wallet with encrypted key storage:

```typescript
import { CreateTonWallet } from "@elizaos/plugin-ton";

// Initialize wallet creation action
const action = new CreateTonWallet(runtime);

// Create a new wallet with encryption
const { walletAddress, mnemonic } = await action.createNewWallet({
  rpcUrl: "https://toncenter.com/api/v2/jsonRPC",
  encryptionPassword: "your-secure-password",
});
```

### Wallet Connectivity

#### TonConnect Integration

Connect to external wallets using TonConnect protocol:

```typescript
import { TonConnectProvider } from "@elizaos/plugin-ton-connect";

// Initialize provider
const provider = await initTonConnectProvider(runtime);

// Connect wallet - returns a universal link or QR code data
const universalLink = await provider.connect();

// Check connection status
const isConnected = provider.isConnected();

// Get wallet connection details
const status = provider.formatConnectionStatus(runtime);

// Disconnect wallet
await provider.disconnect();
```

### Token Operations

#### TON Transfer

Send native TON tokens:

```typescript
import { TransferAction } from "@elizaos/plugin-ton";

// Initialize transfer action
const action = new TransferAction(walletProvider);

// Execute transfer
const hash = await action.transfer({
  recipient: "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
  amount: "1.5",
});
```

#### Jetton (Token) Transfer

Transfer Jetton tokens:

```typescript
import { JettonInteractionAction } from "@elizaos/plugin-ton";

// Initialize jetton interaction
const jettonAction = new JettonInteractionAction(walletProvider);

// Transfer jettons
const result = await jettonAction.transfer(
  "1.5", // Amount
  "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4", // Recipient
  "EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE" // Jetton master address
);
```

#### Batch Transfers

Transfer multiple tokens in a single transaction:

```typescript
import { BatchTransferTokens } from "@elizaos/plugin-ton";

// Initialize batch transfer action
const action = new BatchTransferTokens(walletProvider);

// Define batch transfers
const batchTransfers = {
  transfers: [
    {
      type: "ton",
      recipientAddress: "0QBLy_5Fr6f8NSpMt8SmPGiItnUE0JxgTJZ6m6E8aXoLtJHB",
      amount: "0.1", // TON amount
    },
    {
      type: "token",
      recipientAddress: "0QBLy_5Fr6f8NSpMt8SmPGiItnUE0JxgTJZ6m6E8aXoLtJHB",
      tokenInd: "0QDIUnzAEsgHLL7YSrvm_u7OYSKw93AQbtdidRdcbm7tQep5", // Jetton address
      amount: "1", // Jetton amount
    },
  ],
};

// Execute batch transfer
const reports = await action.createBatchTransfer(batchTransfers);
```

### NFT Operations

#### Transfer NFT

Transfer NFT ownership to a new address:

```typescript
import { TransferNFTAction } from "@elizaos/plugin-ton";

// Initialize NFT transfer action
const transferAction = new TransferNFTAction(walletProvider);

// Transfer NFT ownership
const result = await transferAction.transfer({
  nftAddress: "0QDIUnzAEsgHLL7YSrvm_u7OYSKw93AQbtdidRdcbm7tQep5",
  newOwner: "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4"
});
```

#### Mint NFT

Create a new NFT or mint one inside an existing collection:

```typescript
import { MintNFTAction } from "@elizaos/plugin-ton";

// Initialize NFT minting action
const mintNFTAction = new MintNFTAction(walletProvider);

// Define mint parameters
const mintParams = {
  collectionAddress: "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4", // Optional - if minting to existing collection
  contentUri: "https://example.com/nft-metadata.json",
  royaltyPercent: 5, // 5% royalty fee
  ownerAddress: "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4" // Optional - defaults to wallet address
};

// Mint NFT
const nftAddress = await mintNFTAction.mint(mintParams);
```

#### Get NFT Collection Data

Retrieve information about an NFT collection:

```typescript
import { GetCollectionDataAction } from "@elizaos/plugin-ton";

// Initialize get collection data action
const getCollectionDataAction = new GetCollectionDataAction(walletProvider);

// Get collection data
const collectionData = await getCollectionDataAction.getData("EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4");
```

### Marketplace Operations

#### Create NFT Listing

List an NFT for sale:

```typescript
import { CreateListingAction } from "@elizaos/plugin-ton";

// Initialize listing action
const listingAction = new CreateListingAction(walletProvider);

// Create a listing
const listingResult = await listingAction.list({
  nftAddress: "0QDIUnzAEsgHLL7YSrvm_u7OYSKw93AQbtdidRdcbm7tQep5",
  fullPrice: "10", // Price in TON
});
```

#### Create NFT Auction

Create an NFT auction:

```typescript
import { CreateAuctionAction } from "@elizaos/plugin-ton";

// Initialize auction action
const auctionAction = new CreateAuctionAction(walletProvider);

// Create an auction
const auctionResult = await auctionAction.createAuction({
  nftAddress: "0QDIUnzAEsgHLL7YSrvm_u7OYSKw93AQbtdidRdcbm7tQep5",
  minimumBid: "5", // Minimum bid in TON
  maximumBid: "20", // Buy now price in TON
  expiryTime: "24", // Auction duration in hours
});
```

#### Get Auction Data

Retrieve information about an NFT auction:

```typescript
import { AuctionInteractionAction } from "@elizaos/plugin-ton";

// Initialize auction interaction
const auctionAction = new AuctionInteractionAction(walletProvider);

// Get auction data
const auctionData = await auctionAction.getAuctionData("0QDIUnzAEsgHLL7YSrvm_u7OYSKw93AQbtdidRdcbm7tQep5");
```

### DEX Integration

#### Swap Tokens

Swap tokens using the STON.fi DEX:

```typescript
import { SwapAction } from "@elizaos/plugin-ton";

// Initialize swap action
const swapAction = new SwapAction(walletProvider);

// Define assets for swap
const tonAsset = { kind: "Ton" };
const jettonAsset = { 
  kind: "Jetton", 
  contractAddress: "EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE" 
};

// Swap TON for Jetton
const swapResult = await swapAction.swap(tonAsset, jettonAsset, "1.5");

// Swap Jetton for TON
const swapBackResult = await swapAction.swap(jettonAsset, tonAsset, "10");
```

#### Manage Liquidity

Add liquidity to DEX pools:

```typescript
import { DexAction, DexProvider } from "@elizaos/plugin-ton";

// Initialize DEX provider and action
const dexProvider = new DexProvider(walletProvider);
const dexAction = new DexAction(walletProvider, dexProvider);

// Define deposit parameters for Ston.fi
const depositDetails = {
  operation: "deposit",
  dex: "stonfi",
  jettonDeposits: [
    {
      jetton: { address: "EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE" },
      amount: 10
    }
  ],
  tonAmount: 1.5
};

// Execute deposit
const txHash = await dexAction.run(depositDetails);

// Define withdrawal parameters
const withdrawDetails = {
  operation: "withdraw",
  dex: "stonfi",
  jettonWithdrawals: [
    {
      jetton: { address: "EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE" }
    }
  ],
  isTon: true,
  amount: 0.5
};

// Execute withdrawal
const withdrawHash = await dexAction.run(withdrawDetails);
```

### Lending & Borrowing

#### Get Lending Information

Get lending information for a wallet:

```typescript
import { GetLendingInfoAction } from "@elizaos/plugin-ton";

// Initialize lending info action
const lendingInfoAction = new GetLendingInfoAction(walletProvider);

// Get lending information for an address
const lendingInfo = await lendingInfoAction.getLendingInfo("EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4");

// Example response:
// {
//   borrowBalance: "50",
//   supplyBalance: "10",
//   availableToBorrow: "30.5",
//   debtLimitUsed: "39",
//   healthFactor: "0.32"
// }
```

## Advanced Features

### Price Information

#### Get Token Price

Get price information for tokens:

```typescript
import { TokenPriceProvider } from "@elizaos/plugin-ton";

// Initialize token price provider
const priceProvider = await initTokenPriceProvider(runtime);

// Get TON price in USD
const tonPrice = await priceProvider.getNativeTokenPriceInUsd();

// Get Jetton price in USD
const jettonPrice = await priceProvider.getJettonPriceInUsd("EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE");
```

### Query Asset Information

Get detailed information about assets on STON.fi DEX:

```typescript
import { QueryStonAssetAction } from "@elizaos/plugin-ton";

// Initialize query asset action
const queryAction = new QueryStonAssetAction(walletProvider);

// Query asset information
const assetInfo = await queryAction.query("EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE");
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm run test
```

## Dependencies

- `@ston-fi/api`: API for STON.fi DEX
- `@ston-fi/sdk`: SDK for STON.fi DEX
- `@ton/ton`: Core TON blockchain functionality
- `@ton/crypto`: Cryptographic operations
- `@torch-finance/core`: Torch Finance Core functionality
- `@dedust/sdk`: Dedust DEX SDK
- `bignumber.js`: Precise number handling
- `node-cache`: Caching functionality
- Other standard dependencies listed in package.json

## API Reference

### Providers

- `walletProvider`: Manages TON wallet operations
- `nativeWalletProvider`: Handles native TON token operations

### Types

```typescript
interface TransferContent {
  recipient: string;
  amount: string | number;
}

interface WalletPortfolio {
  totalUsd: string;
  totalNativeToken: string;
}

interface Prices {
  nativeToken: { usd: string };
}
```

### Configuration Constants

```typescript
const PROVIDER_CONFIG = {
  MAINNET_RPC: "https://toncenter.com/api/v2/jsonRPC",
  STONFI_TON_USD_POOL: "EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4",
  CHAIN_NAME_IN_DEXSCREENER: "ton",
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  TON_DECIMAL: BigInt(1000000000),
};
```

## Common Issues/Troubleshooting

### Issue: Balance Fetching Failure

- **Cause**: Incorrect RPC endpoint or network connectivity issues
- **Solution**: Verify `TON_RPC_URL` and network connection

### Issue: Transfer Fails

- **Cause**: Insufficient balance or invalid recipient address
- **Solution**: Ensure sufficient funds and valid recipient address format

## Security Best Practices

- Store private keys securely using environment variables
- Validate all input addresses and amounts
- Use proper error handling for blockchain operations
- Keep dependencies updated for security patches

## Future Enhancements

1. **Wallet Management**

   - Multi-wallet support
   - Hardware wallet integration
   - Advanced key management
   - Batch transaction processing
   - Custom wallet contracts
   - Recovery mechanisms

2. **Smart Contract Integration**

   - Contract deployment tools
   - FunC contract templates
   - Testing framework
   - Upgrade management
   - Gas optimization
   - Security analysis

3. **Token Operations**

   - Jetton creation tools
   - NFT support enhancement
   - Token metadata handling
   - Collection management
   - Batch transfers
   - Token standards

4. **DeFi Features**

   - DEX integration
   - Liquidity management
   - Yield farming tools
   - Price feed integration
   - Swap optimization
   - Portfolio tracking

5. **Developer Tools**

   - Enhanced debugging
   - CLI improvements
   - Documentation generator
   - Integration templates
   - Performance monitoring
   - Testing utilities

6. **Network Features**
   - Workchain support
   - Sharding optimization
   - RPC management
   - Network monitoring
   - Archive node integration
   - Custom endpoints

We welcome community feedback and contributions to help prioritize these enhancements.

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for more information.

## Credits

This plugin integrates with and builds upon several key technologies:

- [STON.fi](https://ston.fi/): STON.fi DEX
- [TON Blockchain](https://ton.org/): The Open Network blockchain platform
- [@ton/ton](https://www.npmjs.com/package/@ton/ton): Core TON blockchain functionality
- [@ton/crypto](https://www.npmjs.com/package/@ton/crypto): Cryptographic operations
- [bignumber.js](https://github.com/MikeMcl/bignumber.js/): Precise number handling
- [node-cache](https://github.com/node-cache/node-cache): Caching functionality

Special thanks to:

- The TON Foundation for developing and maintaining the TON blockchain
- The TON Developer community
- The TON SDK maintainers
- The STON.fi SDK maintainers
- The Eliza community for their contributions and feedback

For more information about TON blockchain capabilities:

- [TON Documentation](https://docs.ton.org/)
- [TON Developer Portal](https://ton.org/dev)
- [TON Whitepaper](https://ton.org/whitepaper.pdf)
- [TON API Reference](https://ton.org/docs/#/api)

## License

This plugin is part of the Eliza project. See the main project repository for license information.
