import type { Socket } from "socket.io-client";

/**
 * Global socket reference for Tanuki Cloud connection.
 * Set by Legion daemon (index.ts) when running in Cloud mode.
 * Used by SocketProvider for LLM requests when delegating to API.
 */
let _socket: Socket | null = null;

export function setLegionSocket(socket: Socket | null): void {
  _socket = socket;
}

export function getLegionSocket(): Socket | null {
  return _socket;
}
