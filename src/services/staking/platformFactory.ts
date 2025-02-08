import { elizaLogger } from "@elizaos/core";
import { Address } from "@ton/ton";

import { StakingPlatform } from "./interfaces/stakingPlatform.ts";

import {
  PLATFORM_TYPES,
  STAKING_POOL_ADDRESSES,
  PlatformType,
} from "./config/platformConfig.ts";

function isPlatformType(type: string): type is PlatformType {
  return PLATFORM_TYPES.includes(type as PlatformType);
}

type StakingPoolAddresses = {
  [K in PlatformType]: Address[];
};

export class PlatformFactory {
  private static strategies = new Map<PlatformType, StakingPlatform>();
  private static addresses: StakingPoolAddresses;

  // initliazer block
  static {
    this.addresses = Object.fromEntries(
      Object.entries(STAKING_POOL_ADDRESSES).map(([type, addrs]) => [
        type,
        addrs.map((addr) => Address.parse(addr)),
      ])
    ) as StakingPoolAddresses;
  }

  static register(type: PlatformType, strategy: StakingPlatform): void {
    this.strategies.set(type, strategy);
  }

  static getStrategy(address: Address): StakingPlatform | null {
    const type = this.getPlatformType(address);
    if (!type) {
      elizaLogger.info(`Unknown platform address: ${address}`);
      return null;
    }

    const strategy = this.strategies.get(type);
    if (!strategy) {
      elizaLogger.warn(`No strategy implemented for platform: ${type}`);
      return null;
    }

    elizaLogger.debug(`Found strategy for platform: ${type}`);
    return strategy;
  }

  static getAllStrategies(): StakingPlatform[] {
    return Array.from(this.strategies.values());
  }

  private static getPlatformType(address: Address): PlatformType | null {
    const entry = Object.entries(this.addresses).find(([_, addresses]) =>
      addresses.some((addr) => addr.equals(address))
    );

    if (!entry) return null;

    const [type] = entry;
    return isPlatformType(type) ? type : null;
  }

  static getAllAddresses(): Address[] {
    return Object.values(this.addresses).flat();
  }

  static getAddressesByType(type: PlatformType): Address[] {
    return this.addresses[type] || [];
  }

  static getAvailablePlatformTypes(): PlatformType[] {
    return [...PLATFORM_TYPES];
  }
}
