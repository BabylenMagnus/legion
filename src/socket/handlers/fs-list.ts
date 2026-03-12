import path from "path";
import type { SocketRequest, SocketResponse } from "../dispatcher";
import { type Socket } from "socket.io-client";
import { listFiles } from "../../file/legion-bridge";
import { isPathAllowed } from "../../core/path-validator";
import type { Config } from "../../core/config";
import { getAllowedPaths, getProjectRoot } from "../../core/config";

/**
 * Handle filesystem list request.
 *
 * Two modes:
 *  - Workspace mode (projectId present): resolves relative path from the
 *    project's locally-bound root. Legion is the source of truth for the path.
 *  - Explorer mode (no projectId): accepts an absolute path and checks it
 *    against allowedPaths. Used by the file-browser during project binding.
 */
export async function handleFsList(
  req: SocketRequest,
  socket: Socket
): Promise<SocketResponse> {
  const { path: requestedPath, projectId, depth = 1 } = req;
  const config = (socket as any).legionConfig as Config;

  let targetPath: string;

  if (projectId) {
    // Workspace mode — resolve relative path from project root
    const root = getProjectRoot(config, projectId);
    if (!root) {
      return {
        id: req.id,
        status: "error",
        error: "Project not bound on this device. Use project:bind first.",
      };
    }
    const rel = !requestedPath || requestedPath === "/"
      ? ""
      : requestedPath.replace(/^\//, "");
    targetPath = rel ? path.join(root, rel) : root;

    // Guard against path traversal (e.g. path = "../../etc")
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(path.resolve(root))) {
      return { id: req.id, status: "error", error: "Path traversal denied" };
    }
    targetPath = resolved;
  } else {
    // Explorer mode — absolute path, must be in allowedPaths whitelist
    targetPath = requestedPath || process.cwd();
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
    const files = await listFiles(targetPath, depth);
    return { id: req.id, status: "ok", data: files };
  } catch (error) {
    return {
      id: req.id,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
