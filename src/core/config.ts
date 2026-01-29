import os from "os";
import path from "path";
import fs from "fs/promises";
import { z } from "zod";

// Config schema
// Matches format written by install scripts: { id, token, serverUrl }
const ConfigSchema = z.object({
  id: z.string().optional(), // Token ID from database (for faster lookup)
  token: z.string(), // Secret token (lg_xxx format)
  serverUrl: z.string().url(),
  allowedPaths: z.array(z.string()).optional(), // Whitelist paths for file system access
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
    // Read file content
    let content = await fs.readFile(CONFIG_FILE, "utf-8");
    
    // Remove BOM (Byte Order Mark) that Windows PowerShell likes to add
    content = content.replace(/^\uFEFF/, '');
    
    // Parse JSON
    const data = JSON.parse(content);
    // Validate schema
    const result = ConfigSchema.safeParse(data);
    
    if (!result.success) {
      return null;
    }

    return result.data;

  } catch (error) {
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
  const fileConfig = await loadConfig();
  
  // Log whether config was found
  console.log("[DEBUG] Loaded config object:", fileConfig ? "FOUND" : "NULL");

  const id = fileConfig?.id || process.env.LEGION_TOKEN_ID || undefined;
  const token = fileConfig?.token || process.env.LEGION_TOKEN_SECRET || process.env.LEGION_TOKEN;
  const serverUrl = fileConfig?.serverUrl || process.env.TANUKI_SERVER_URL || "wss://tanuki.sabw.ru";
  
  if (!token) {
    throw new Error(
      "Legion token not found. Please set LEGION_TOKEN_SECRET (or LEGION_TOKEN) environment variable or configure ~/.tanuki/config.json"
    );
  }
  
  const config: Config = {
    token,
    serverUrl,
  };
  
  if (id) {
    config.id = id;
  }
  
  // Include allowedPaths if present in file config
  if (fileConfig?.allowedPaths) {
    config.allowedPaths = fileConfig.allowedPaths;
  }
  
  return config;
}

/**
 * Get allowed paths from config
 * Returns whitelist paths or default to home directory
 */
export function getAllowedPaths(config: Config): string[] {
  if (config.allowedPaths && config.allowedPaths.length > 0) {
    return config.allowedPaths.map(p => path.resolve(p));
  }
  return [HOME_DIR];
}

/**
 * Update config file atomically
 * Merges updates with existing config and validates before saving
 */
export async function updateConfig(updates: Partial<Config>): Promise<void> {
  const currentConfig = await loadConfig();
  if (!currentConfig) {
    throw new Error("Cannot update config: config file does not exist");
  }
  
  const updatedConfig: Config = {
    ...currentConfig,
    ...updates,
  };
  
  // Validate before saving
  ConfigSchema.parse(updatedConfig);
  
  // Atomic write via saveConfig (already handles permissions 0o600)
  await saveConfig(updatedConfig);
}
