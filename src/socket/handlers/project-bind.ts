import { SocketRequest, SocketResponse } from "../dispatcher";
import { type Socket } from "socket.io-client";
import { bindProject } from "../../project/binding";
import { isPathAllowed } from "../../core/path-validator";
import { getAllowedPaths, Config } from "../../core/config";

/**
 * Handle project binding request
 */
export async function handleProjectBind(
  req: SocketRequest,
  socket: Socket
): Promise<SocketResponse> {
  const { path: requestedPath, projectId, projectName } = req;
  
  if (!requestedPath) {
    return {
      id: req.id,
      status: "error",
      error: "Path is required",
    };
  }
  
  if (!projectId) {
    return {
      id: req.id,
      status: "error",
      error: "projectId is required",
    };
  }
  
  // Get config from socket context
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
    const configPath = await bindProject(requestedPath, projectId, projectName);
    return {
      id: req.id,
      status: "ok",
      data: { configPath },
    };
  } catch (error) {
    return {
      id: req.id,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
