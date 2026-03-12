import path from "path";
import type { SocketRequest, SocketResponse } from "../dispatcher";
import { type Socket } from "socket.io-client";
import { readFile } from "../../file/legion-bridge";
import { isPathAllowed } from "../../core/path-validator";
import type { Config } from "../../core/config";
import { getAllowedPaths, getProjectRoot } from "../../core/config";

/**
 * Handle filesystem read request.
 *
 * Two modes (same logic as fs-list):
 *  - Workspace mode (projectId present): resolves relative path from project root.
 *  - Explorer mode (no projectId): absolute path checked against allowedPaths.
 */
export async function handleFsRead(
  req: SocketRequest,
  socket: Socket
): Promise<SocketResponse> {
  const { path: requestedPath, projectId, maxSize } = req;

  if (!requestedPath) {
    return { id: req.id, status: "error", error: "Path is required" };
  }

  const config = (socket as any).legionConfig as Config;
  let targetPath: string;

  if (projectId) {
    // Workspace mode
    const root = getProjectRoot(config, projectId);
    if (!root) {
      return {
        id: req.id,
        status: "error",
        error: "Project not bound on this device. Use project:bind first.",
      };
    }
    const rel = requestedPath.replace(/^\//, "");
    targetPath = path.resolve(path.join(root, rel));

    if (!targetPath.startsWith(path.resolve(root))) {
      return { id: req.id, status: "error", error: "Path traversal denied" };
    }
  } else {
    // Explorer mode
    targetPath = requestedPath;
    const allowedPaths = getAllowedPaths(config);
    if (!isPathAllowed(targetPath, allowedPaths)) {
      return {
        id: req.id,
        status: "error",
        error: "Access denied: path not in whitelist",
      };
    }
  }

  try {
    const content = await readFile(targetPath, maxSize || 1024 * 1024);
    return { id: req.id, status: "ok", data: content };
  } catch (error) {
    return {
      id: req.id,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
