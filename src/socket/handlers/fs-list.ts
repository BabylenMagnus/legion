import { SocketRequest, SocketResponse } from "../dispatcher";
import { type Socket } from "socket.io-client";
import { listFiles } from "../../file/legion-bridge";
import { isPathAllowed } from "../../core/path-validator";
import { getAllowedPaths, Config } from "../../core/config";

/**
 * Handle filesystem list request
 */
export async function handleFsList(
  req: SocketRequest,
  socket: Socket
): Promise<SocketResponse> {
  const { path: requestedPath, depth = 1 } = req;
  const targetPath = requestedPath || process.cwd();
  
  // Get config from socket context
  const config = (socket as any).legionConfig as Config;
  const allowedPaths = getAllowedPaths(config);
  
  if (!isPathAllowed(targetPath, allowedPaths)) {
    return {
      id: req.id,
      status: "error",
      error: "Access denied: path not in whitelist",
    };
  }
  
  try {
    const files = await listFiles(targetPath, depth);
    return {
      id: req.id,
      status: "ok",
      data: files,
    };
  } catch (error) {
    return {
      id: req.id,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
