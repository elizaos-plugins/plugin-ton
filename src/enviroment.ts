import type { IAgentRuntime } from "@elizaos/core";
import { z } from "zod";

export const CONFIG_KEYS = {
  TON_PRIVATE_KEY: "TON_PRIVATE_KEY",
  TON_RPC_URL: "TON_RPC_URL",
  TON_RPC_API_KEY: "TON_RPC_API_KEY",
  TON_EXPLORER_URL: "TON_EXPLORER_URL",
  TON_MANIFEST_URL: "TON_MANIFEST_URL",
  TON_BRIDGE_URL: "TON_BRIDGE_URL",
};

export const envSchema = z.object({
  TON_PRIVATE_KEY: z.string().min(1, "Ton private key is required"),
  TON_RPC_URL: z.string(),
  TON_RPC_API_KEY: z.string(),
  TON_EXPLORER_URL: z.string(),
  TON_MANIFEST_URL: z.string(),
  TON_BRIDGE_URL: z.string(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export async function validateEnvConfig(
  runtime: IAgentRuntime
): Promise<EnvConfig> {
  try {
    const config = {
      TON_PRIVATE_KEY:
        runtime.getSetting(CONFIG_KEYS.TON_PRIVATE_KEY) ||
        process.env.TON_PRIVATE_KEY,
      TON_RPC_URL:
        runtime.getSetting(CONFIG_KEYS.TON_RPC_URL) || process.env.TON_RPC_URL,
      TON_RPC_API_KEY:
        runtime.getSetting(CONFIG_KEYS.TON_RPC_API_KEY) ||
        process.env.TON_RPC_API_KEY,
      TON_EXPLORER_URL:
        runtime.getSetting(CONFIG_KEYS.TON_EXPLORER_URL) ||
        process.env.TON_EXPLORER_URL,
      TON_MANIFEST_URL:
        runtime.getSetting(CONFIG_KEYS.TON_MANIFEST_URL) ||
        process.env.TON_MANIFEST_URL,
      TON_BRIDGE_URL:
        runtime.getSetting(CONFIG_KEYS.TON_BRIDGE_URL) ||
        process.env.TON_BRIDGE_URL,
    };

    return envSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Ton configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}
