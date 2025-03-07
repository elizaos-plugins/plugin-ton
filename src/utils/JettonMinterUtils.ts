import { beginCell, Cell, Dictionary } from "@ton/ton";

export type JettonMetaDataKeys =
  | "name"
  | "description"
  | "image"
  | "symbol"
  | "decimals"
  | "uri"
  | "social"
  | "website";

/**
 * Build on-chain metadata for a Jetton
 * @param data Object containing metadata key-value pairs
 * @returns Cell containing the metadata
 */
export function buildJettonOnchainMetadata(data: { [s in JettonMetaDataKeys]?: string | undefined }): Cell {
  const dict = Dictionary.empty(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell());
  
  Object.entries(data).forEach(([k, v]) => {
    if (v) {
      dict.set(
        Buffer.from(k),
        beginCell().storeUint(0, 8).storeStringTail(v).endCell()
      );
    }
  });
  
  return beginCell().storeUint(0, 8).storeDict(dict).endCell();
}

/**
 * Build off-chain metadata for a Jetton
 * @param uri URI pointing to the metadata
 * @returns Cell containing the metadata URI
 */
export function buildJettonOffChainMetadata(uri: string): Cell {
  return beginCell()
    .storeUint(0x01, 8) // off-chain marker
    .storeStringTail(uri)
    .endCell();
}

/**
 * Parse token metadata from a cell
 * @param cell Cell containing the metadata
 * @returns Object with parsed metadata
 */
export function parseTokenMetadataCell(cell: Cell): Record<string, string> {
  const slice = cell.beginParse();
  const type = slice.loadUint(8);
  
  // Handle on-chain metadata
  if (type === 0) {
    const dict = slice.loadDict(Dictionary.Keys.Buffer(32), Dictionary.Values.Cell());
    const metadata: Record<string, string> = {};
    
    for (const [key, value] of dict) {
      const keyString = key.toString();
      const valueSlice = value.beginParse();
      valueSlice.loadUint(8); // Skip prefix
      metadata[keyString] = valueSlice.loadStringTail();
    }
    
    return metadata;
  }
  
  // Handle off-chain metadata
  if (type === 1) {
    return {
      uri: slice.loadStringTail()
    };
  }
  
  return {};
}

/**
 * Create a Jetton content cell from metadata
 * @param metadata Object containing metadata key-value pairs
 * @returns Cell containing the content
 */
export function createJettonContent(metadata: Record<string, string>): Cell {
  return buildJettonOnchainMetadata(metadata);
}