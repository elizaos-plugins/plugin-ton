import { beginCell, internal, SendMode, toNano } from "@ton/core";
import { 
  getBuyPrice, 
  getListingData, 
  getMinBid, 
  getNextValidBidAmount, 
  isAuction, 
  isAuctionEnded 
} from "./listingData";
import { waitSeqnoContract } from "../../utils/util";
import { WalletProvider } from "../../providers/wallet";

export async function buyListing(
  walletProvider: WalletProvider,
  nftAddress: string
): Promise<any> {
  try {
    const { listingAddress } = await getListingData(walletProvider, nftAddress);
    const fullPrice = await getBuyPrice(walletProvider, nftAddress);

    // Calculate amount to send (price + gas)
    const gasAmount = toNano("1"); // 1 TON for gas
    const amountToSend = fullPrice + gasAmount;

    // Send the transaction to buy
    const client = walletProvider.getWalletClient();
    const contract = client.open(walletProvider.wallet);

    const seqno = await contract.getSeqno();
    const transferMessage = internal({
      to: listingAddress,
      value: amountToSend,
      bounce: true,
      body: "", // Empty body for default buy operation
    });

    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [transferMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await waitSeqnoContract(seqno, contract);

    return {
      nftAddress,
      listingAddress: listingAddress.toString(),
      price: fullPrice.toString(),
      message: "Buy transaction sent successfully",
    };
  } catch (error) {
    throw new Error(`Failed to buy NFT: ${error.message}`);
  }
}

export async function cancelListing(
  walletProvider: WalletProvider,
  nftAddress: string
): Promise<any> {
  try {
    const listingData = await getListingData(walletProvider, nftAddress);
    
    // Opcode for cancellation
    const opcode = listingData.isAuction ? 1 : 3; // 1 for auction, 3 for fixed price

    const msgBody = beginCell().storeUint(opcode, 32).storeUint(0, 64).endCell(); // queryId = 0
    const gasAmount = toNano("0.2"); // 0.2 TON for cancellation gas

    // Send the transaction to cancel
    const client = walletProvider.getWalletClient();
    const contract = client.open(walletProvider.wallet);

    const seqno = await contract.getSeqno();
    const transferMessage = internal({
      to: listingData.listingAddress,
      value: gasAmount,
      bounce: true,
      body: msgBody,
    });

    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [transferMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await waitSeqnoContract(seqno, contract);

    return {
      nftAddress,
      listingAddress: listingData.listingAddress.toString(),
      message: "Cancel listing transaction sent successfully",
    };
  } catch (error) {
    throw new Error(`Failed to cancel NFT listing: ${error.message}`);
  }
}

/**
 * Place a bid on an auction
 */
export async function bidOnAuction(
  walletProvider: WalletProvider,
  nftAddress: string,
  bidAmount?: bigint
): Promise<any> {
  try {
    const listingData = await getListingData(walletProvider, nftAddress);
    
    if (!listingData.isAuction) {
      throw new Error("Cannot bid on a fixed-price listing. Use buyListing instead.");
    }
    
    // Check if auction has ended
    const auctionEnded = await isAuctionEnded(walletProvider, nftAddress);
    if (auctionEnded) {
      throw new Error("Auction has already ended.");
    }
    
    // If no bidAmount provided, get the next valid bid amount
    const bid = bidAmount || await getNextValidBidAmount(walletProvider, nftAddress);
    
    // Check if bid is valid
    const minBid = await getMinBid(walletProvider, nftAddress);
    if (bid < minBid) {
      throw new Error(`Bid too low. Minimum bid is ${minBid.toString()}.`);
    }

    // Gas amount for the transaction
    const gasAmount = toNano("1");
    const amountToSend = bid + gasAmount;

    // Send the bid transaction
    const client = walletProvider.getWalletClient();
    const contract = client.open(walletProvider.wallet);

    const seqno = await contract.getSeqno();
    
    // Op code for placing bid is typically 2
    const bidMessage = beginCell().storeUint(2, 32).storeUint(0, 64).endCell();
    
    const transferMessage = internal({
      to: listingData.listingAddress,
      value: amountToSend,
      bounce: true,
      body: bidMessage,
    });

    await contract.sendTransfer({
      seqno,
      secretKey: walletProvider.keypair.secretKey,
      messages: [transferMessage],
      sendMode: SendMode.IGNORE_ERRORS + SendMode.PAY_GAS_SEPARATELY,
    });

    await waitSeqnoContract(seqno, contract);

    return {
      nftAddress,
      listingAddress: listingData.listingAddress.toString(),
      bidAmount: bid.toString(),
      message: "Bid placed successfully",
    };
  } catch (error) {
    throw new Error(`Failed to place bid: ${error.message}`);
  }
}