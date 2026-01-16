// tanuki_legion/src/index.ts
import { io } from "socket.io-client";
import { type Socket } from "socket.io-client";
import os from "os";
import { getConfig } from "./core/config";
import { Log } from "./util/log";

// Initialize logging (simplified for Legion - always print to console)
const log = Log.create({ service: "legion" });

async function main() {
  try {
    // Load configuration
    log.info("🛡️  Legion v0.1 starting...");
    const config = await getConfig();
    
    log.info("🔗 Connecting to server", { serverUrl: config.serverUrl });
    
    // Create socket connection
    const socket: Socket = io(config.serverUrl, {
      auth: {
        token: config.token,
        type: "legion",
      },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    // Connection event handlers
    socket.on("connect", () => {
      log.info("✅ Connected to server", { socketId: socket.id });
      
      // Send handshake with device info
      const handshakeData = {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        cwd: process.cwd(),
      };
      
      socket.emit("legion:handshake", handshakeData);
      log.debug("📤 Sent handshake", handshakeData);
    });

    socket.on("connect_error", (err) => {
      log.error("❌ Connection error", { 
        message: err.message,
        type: err.type,
      });
      
      // Check if it's an authentication error
      if (err.message.includes("auth") || err.message.includes("token")) {
        log.error("🔐 Authentication failed. Please check your token.");
        log.error("💡 Re-authenticate by updating ~/.tanuki/config.json or LEGION_TOKEN env var");
        process.exit(1);
      }
    });

    socket.on("disconnect", (reason) => {
      log.warn("⚠️  Disconnected from server", { reason });
      
      if (reason === "io server disconnect") {
        // Server forcibly disconnected, don't reconnect
        log.error("🚫 Server disconnected this client. Please check your token.");
        process.exit(1);
      }
    });

    // Keep-alive ping/pong
    socket.on("server:ping", (data) => {
      log.debug("📩 Ping from server", data);
      socket.emit("legion:pong", { ts: Date.now() });
    });

    // Handle reconnection
    socket.on("reconnect", (attemptNumber) => {
      log.info("🔄 Reconnected to server", { attempt: attemptNumber });
    });

    socket.on("reconnect_attempt", (attemptNumber) => {
      log.debug("🔄 Reconnection attempt", { attempt: attemptNumber });
    });

    socket.on("reconnect_error", (error) => {
      log.error("🔄 Reconnection error", { message: error.message });
    });

    socket.on("reconnect_failed", () => {
      log.error("🔄 Reconnection failed after all attempts");
      process.exit(1);
    });

    // Keep process alive
    process.stdin.resume();

    // Graceful shutdown
    const shutdown = () => {
      log.info("🛑 Shutting down...");
      socket.disconnect();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Handle uncaught errors
    process.on("unhandledRejection", (reason) => {
      log.error("Unhandled rejection", { reason });
    });

    process.on("uncaughtException", (error) => {
      log.error("Uncaught exception", { error: error.message, stack: error.stack });
      shutdown();
    });

  } catch (error) {
    if (error instanceof Error) {
      log.error("Failed to start Legion", { 
        message: error.message,
        stack: error.stack,
      });
      console.error("\n❌", error.message);
      console.error("\n💡 Make sure you have configured your token:");
      console.error("   - Set LEGION_TOKEN environment variable, or");
      console.error("   - Create ~/.tanuki/config.json with your token");
    } else {
      log.error("Failed to start Legion", { error });
      console.error("\n❌ Unknown error occurred");
    }
    process.exit(1);
  }
}

main();
