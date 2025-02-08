import { elizaLogger } from '@elizaos/core';
import { StakingPlatform } from './interfaces/stakingPlatform.ts';
import platformAddresses from './stakingPoolAddresses.json';
import { Address } from '@ton/ton';

type PlatformType = 'TON_POOLS' | 'TON_WHALES' | 'HIPO';

export class PlatformFactory {
  private static strategies = new Map<PlatformType, StakingPlatform>();
  
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
      elizaLogger.info(`No strategy implemented for platform: ${type}`);
      return null
    }

    return strategy;
  }

  private static getPlatformType(address: Address): PlatformType | null {
    if (platformAddresses.TON_POOLS.includes(address.toString())) {
      return 'TON_POOLS';
    }
    if (platformAddresses.TON_WHALES.includes(address.toString())) {
      return 'TON_WHALES';
    }
    if (platformAddresses.HIPO.includes(address.toString())) {
      return 'HIPO';
    }
    return null;
  }
}