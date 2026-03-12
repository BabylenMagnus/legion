import type { SocketRequest, SocketResponse } from "../dispatcher";
import { type Socket } from "socket.io-client";
import { isPathAllowed } from "../../core/path-validator";
import type { Config } from "../../core/config";
import { getAllowedPaths, saveProjectBinding } from "../../core/config";

/**
 * Handle project binding request.
 *
 * Saves { projectId → absolutePath } into ~/.legion/config.json.
 * The cloud never sees the absolute path — Legion is the sole source of truth.
 */
export async function handleProjectBind(
  req: SocketRequest,
  socket: Socket
): Promise<SocketResponse> {
  const { path: requestedPath, projectId } = req;

  if (!requestedPath) {
    return { id: req.id, status: "error", error: "Path is required" };
  }

  if (!projectId) {
    return { id: req.id, status: "error", error: "projectId is required" };
  }

  const config = (socket as any).legionConfig as Config;
  const allowedPaths = getAllowedPaths(config);

  if (!isPathAllowed(requestedPath, allowedPaths)) {
    return {
      id: req.id,
      status: "error",
      error: "Access denied: path not in whitelist",
    };
  }

  try {
    await saveProjectBinding(config, projectId, requestedPath);
    return { id: req.id, status: "ok", data: { bound: true, projectId, path: requestedPath } };
  } catch (error) {
    return {
      id: req.id,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
