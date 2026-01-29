import { SocketRequest, SocketResponse } from "../dispatcher";
import { type Socket } from "socket.io-client";
import { readFile } from "../../file/legion-bridge";
import { isPathAllowed } from "../../core/path-validator";
import { getAllowedPaths, Config } from "../../core/config";

/**
 * Handle filesystem read request
 */
export async function handleFsRead(
  req: SocketRequest,
  socket: Socket
): Promise<SocketResponse> {
  const { path: requestedPath, maxSize } = req;
  
  if (!requestedPath) {
    return {
      id: req.id,
      status: "error",
      error: "Path is required",
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
    const content = await readFile(requestedPath, maxSize || 1024 * 1024);
    return {
      id: req.id,
      status: "ok",
      data: content,
    };
  } catch (error) {
    return {
      id: req.id,
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
