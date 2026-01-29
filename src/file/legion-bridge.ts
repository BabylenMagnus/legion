import fs from "fs/promises";
import path from "path";
import type { BunFile } from "bun";
import { Log } from "../util/log";

const log = Log.create({ service: "file.legion-bridge" });

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface FileContent {
  type: "text" | "blob";
  content?: string;
  encoding?: "utf-8" | "base64";
  mimeType?: string;
  size?: number;
  error?: "too_large";
}

/**
 * List files in a directory without Instance context
 */
export async function listFiles(targetPath: string, depth: number = 1): Promise<FileNode[]> {
  const resolved = path.resolve(targetPath);
  const exclude = [".git", ".DS_Store", ".tanuki"];
  
  const nodes: FileNode[] = [];
  
  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    
    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;
      
      const fullPath = path.join(resolved, entry.name);
      const isDirectory = entry.isDirectory();
      
      const node: FileNode = {
        name: entry.name,
        path: fullPath,
        type: isDirectory ? "directory" : "file",
      };
      
      if (!isDirectory) {
        try {
          const stats = await fs.stat(fullPath);
          node.size = stats.size;
        } catch {
          // Ignore stat errors
        }
      }
      
      nodes.push(node);
    }
  } catch (error) {
    log.error("Failed to list directory", { error, targetPath });
    throw error;
  }
  
  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Check if file should be encoded as base64 (binary file)
 * Reuses logic from File.shouldEncode
 */
async function shouldEncode(file: BunFile): Promise<boolean> {
  const type = file.type?.toLowerCase();
  if (!type) return false;

  if (type.startsWith("text/")) return false;
  if (type.includes("charset=")) return false;

  const parts = type.split("/", 2);
  const top = parts[0];
  const rest = parts[1] ?? "";
  const sub = rest.split(";", 1)[0];

  const tops = ["image", "audio", "video", "font", "model", "multipart"];
  if (tops.includes(top)) return true;

  const bins = [
    "zip",
    "gzip",
    "bzip",
    "compressed",
    "binary",
    "pdf",
    "msword",
    "vnd.ms",
    "octet-stream",
  ];
  if (bins.includes(sub)) return true;

  // Check first bytes for null bytes as fallback
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) return false;
    const view = new Uint8Array(buffer.slice(0, 512));
    return view.some(byte => byte === 0);
  } catch {
    return false;
  }
}

/**
 * Read file content without Instance context
 * Returns metadata if file is too large
 */
export async function readFile(
  filePath: string,
  maxSize: number = 1024 * 1024
): Promise<FileContent> {
  const resolved = path.resolve(filePath);
  const bunFile = Bun.file(resolved);
  
  if (!(await bunFile.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch (error) {
    throw new Error(`Failed to stat file: ${filePath}`);
  }
  
  if (stats.size > maxSize) {
    return {
      type: "blob",
      size: stats.size,
      error: "too_large",
    };
  }
  
  const encode = await shouldEncode(bunFile);
  
  if (encode) {
    const buffer = await bunFile.arrayBuffer();
    const content = Buffer.from(buffer).toString("base64");
    const mimeType = bunFile.type || "application/octet-stream";
    return {
      type: "blob",
      content,
      encoding: "base64",
      mimeType,
      size: stats.size,
    };
  }
  
  const content = await bunFile.text().catch(() => "");
  return {
    type: "text",
    content,
    encoding: "utf-8",
    size: stats.size,
  };
}
