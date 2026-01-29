import path from "path";
import { realpathSync } from "fs";
import { Filesystem } from "../util/filesystem";
import { Log } from "../util/log";

const log = Log.create({ service: "path-validator" });

/**
 * Check if a requested path is allowed based on whitelist
 * Resolves symlinks and validates that path is within allowed boundaries
 */
export function isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
  try {
    const normalized = path.resolve(requestedPath);
    
    // Resolve symlinks to prevent bypass attempts
    let realPath: string;
    try {
      realPath = realpathSync(normalized);
    } catch {
      // If realpath fails (e.g., path doesn't exist yet), use normalized path
      realPath = normalized;
    }
    
    // Check if path is within any of the allowed paths
    for (const allowed of allowedPaths) {
      const allowedResolved = path.resolve(allowed);
      if (Filesystem.contains(allowedResolved, realPath)) {
        return true;
      }
    }
    
    log.warn("Path access denied", { requestedPath, realPath, allowedPaths });
    return false;
  } catch (error) {
    log.error("Path validation error", { error, requestedPath });
    return false;
  }
}
