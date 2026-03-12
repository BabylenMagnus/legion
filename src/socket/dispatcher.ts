import { type Socket } from "socket.io-client";
import { Log } from "../util/log";
import type { Config } from "../core/config";
import { handleFsList } from "./handlers/fs-list";
import { handleFsRead } from "./handlers/fs-read";
import { handleProjectBind } from "./handlers/project-bind";
import { handleFsRoots } from "./handlers/fs-roots";
import { requestRegistry } from "../provider/socket-provider";
import { Session } from "../session";

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

const ROUTING_KEYS = ["client_sid", "project_id", "_audit_log_id"] as const;

export const handlers: Record<string, Handler> = {
  "fs:list": handleFsList,
  "fs:read": handleFsRead,
  "fs:roots": handleFsRoots,
  "project:bind": handleProjectBind,
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

  // Remove old listeners to avoid duplication on reconnect
  for (const event of Object.keys(handlers)) {
    socket.off(event);
  }

  for (const [event, handler] of Object.entries(handlers)) {
    socket.on(event, async (request: SocketRequest) => {
      log.info(`Executing handler for: ${event}`, { requestId: request.id });
      const routing = Object.fromEntries(
        ROUTING_KEYS.filter((k) => k in request).map((k) => [k, request[k]])
      );
      try {
        const response = await handler(request, socket);
        log.info(`Handler success: ${event}`, { requestId: request.id });
        socket.emit(`${event}:result`, { ...routing, ...response });
      } catch (error) {
        log.error(`Handler error for ${event}`, { error, request });
        socket.emit(`${event}:result`, {
          ...routing,
          id: request.id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  }

  // LLM streaming events (API -> Legion, one-way)
  socket.on("legion:llm:usage", (data: { requestId: string; tokens: any; cost?: number }) => {
    log.debug("llm:usage", { requestId: data.requestId, tokens: data.tokens });
    const entry = requestRegistry.get(data.requestId);
    if (entry) {
      Session.recordUsageFromCloud({
        sessionID: entry.sessionID,
        messageID: entry.messageID,
        requestId: data.requestId,
        tokens: data.tokens,
        cost: data.cost,
      }).catch((err: Error) => log.error("recordUsageFromCloud failed", { error: err }));
    }
  });

  socket.on("legion:llm:error", (data: { requestId: string; error: string }) => {
    if (data.error === "Insufficient funds") {
      console.error("⛔ Баланс Tanuki Cloud исчерпан. Пополните счет в админ-панели.");
    }
    log.error("llm:error", { requestId: data.requestId, error: data.error });
  });

  socket.on("legion:llm:done", (data: { requestId: string }) => {
    log.debug("llm:done", { requestId: data.requestId });
  });

  log.info("Socket dispatcher initialized", { events: Object.keys(handlers) });
}
