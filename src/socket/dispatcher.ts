import { type Socket } from "socket.io-client";
import { Log } from "../util/log";
import { Config } from "../core/config";
import { handleFsList } from "./handlers/fs-list";
import { handleFsRead } from "./handlers/fs-read";
import { handleProjectBind } from "./handlers/project-bind";

export interface SocketRequest {
  id: string;
  [key: string]: any;
}

export interface SocketResponse {
  id: string;
  status: "ok" | "error";
  data?: any;
  error?: string;
}

export type Handler = (req: SocketRequest, socket: Socket) => Promise<SocketResponse>;

export const handlers: Record<string, Handler> = {
  "legion:fs:list": handleFsList,
  "legion:fs:read": handleFsRead,
  "legion:project:bind": handleProjectBind,
};

/**
 * Setup socket event dispatcher
 * Registers all handlers and attaches config to socket context
 */
export function setupDispatcher(
  socket: Socket,
  log: ReturnType<typeof Log.create>,
  config: Config
): void {
  // Attach config to socket for handlers to access
  (socket as any).legionConfig = config;
  
  for (const [event, handler] of Object.entries(handlers)) {
    socket.on(event, async (request: SocketRequest) => {
      try {
        const response = await handler(request, socket);
        socket.emit(`${event}:response`, response);
      } catch (error) {
        log.error(`Handler error for ${event}`, { error, request });
        socket.emit(`${event}:response`, {
          id: request.id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  }
  
  log.info("Socket dispatcher initialized", { events: Object.keys(handlers) });
}
