import { Address, fromNano } from "@ton/ton"; 

export const truncateTONAddress = (address: Address) => {
    const addressString = address.toString()
    if (addressString.length <= 12) return addressString;
    return `${addressString.slice(0, 6)}...${addressString.slice(-6)}`;
};

// Helper function to format numbers with 2 decimal places
export const formatTON = (value: bigint) => {
    const num = parseFloat(fromNano(value));
    return num.toFixed(2);
};