import type { SocketRequest, SocketResponse } from "../dispatcher";
import { type Socket } from "socket.io-client";
import type { Config } from "../../core/config";
import { getAllowedPaths } from "../../core/config";

/**
 * Return the allowed root paths configured on this device.
 * The frontend uses these as starting points in the file browser
 * when the user wants to bind a project to a local folder.
 */
export async function handleFsRoots(
  req: SocketRequest,
  socket: Socket
): Promise<SocketResponse> {
  const config = (socket as any).legionConfig as Config;
  const roots = getAllowedPaths(config);
  return { id: req.id, status: "ok", data: { roots } };
}
