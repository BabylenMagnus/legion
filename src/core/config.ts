import os from "os";
import path from "path";
import fs from "fs/promises";
import { z } from "zod";

// Config schema
const ConfigSchema = z.object({
  token: z.string(),
  serverUrl: z.string().url(),
});

export type Config = z.infer<typeof ConfigSchema>;

// Paths
const HOME_DIR = os.homedir();
export const CONFIG_DIR = path.join(HOME_DIR, ".tanuki");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Ensure config directory exists
 */
export async function ensureConfigDir(): Promise<string> {
  try {
    await fs.access(CONFIG_DIR);
  } catch {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  }
  return CONFIG_FILE;
}

/**
 * Load config from file
 */
export async function loadConfig(): Promise<Config | null> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    const data = JSON.parse(content);
    return ConfigSchema.parse(data);
  } catch (error) {
    // File doesn't exist or invalid format
    return null;
  }
}

/**
 * Save config to file
 */
export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  
  // Set restrictive permissions (owner read/write only)
  try {
    await fs.chmod(CONFIG_FILE, 0o600);
  } catch {
    // chmod may fail on Windows, ignore
  }
}

/**
 * Get config with fallback to environment variables
 */
export async function getConfig(): Promise<Config> {
  // Try loading from file first
  const fileConfig = await loadConfig();
  
  // Fallback to environment variables
  const token = fileConfig?.token || process.env.LEGION_TOKEN;
  const serverUrl = fileConfig?.serverUrl || process.env.TANUKI_SERVER_URL || "wss://tanuki.sabw.ru";
  
  if (!token) {
    throw new Error(
      "Legion token not found. Please set LEGION_TOKEN environment variable or configure ~/.tanuki/config.json"
    );
  }
  
  return {
    token,
    serverUrl,
  };
}
