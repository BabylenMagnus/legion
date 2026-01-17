#!/usr/bin/env node

// tanuki_legion/src/index.ts
import { execSync } from "child_process";
import { version } from "../package.json";

// Fast exit for --version flag (before any heavy imports)
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(version);
  process.exit(0);
}

// Heavy imports after version check
import { io } from "socket.io-client";
import { type Socket } from "socket.io-client";
import * as os from "os";
import { getConfig } from "./core/config";
import { Log } from "./util/log";
import { Global } from "./core/global";

/**
 * Background check for updates (fire-and-forget)
 * Runs npm view with timeout and warns if version is outdated
 */
function checkForUpdates(): void {
  setTimeout(async () => {
    try {
      const packageName = "@babylen/legion";
      const command = `npm view ${packageName} version`;
      const timeout = 3000; // 3 seconds timeout
      
      const latestVersion = execSync(command, { 
        encoding: "utf-8",
        timeout,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      
      if (latestVersion !== version) {
        console.warn(`\n⚠️  Update available: ${version} → ${latestVersion}`);
        console.warn(`   Run: npm install -g ${packageName}@latest\n`);
      }
    } catch (error) {
      // Silently fail - network issues or timeout, don't interrupt user
    }
  }, 100);
}

async function main() {

  // Safe log fallback (in case error occurs before log initialization)
  let log: ReturnType<typeof Log.create> | null = null;
  const safeLog = {
    info: (message?: any, extra?: Record<string, any>) => {
      if (log) log.info(message, extra);
      else console.log(message, extra);
    },
    error: (message?: any, extra?: Record<string, any>) => {
      if (log) log.error(message, extra);
      else console.error(message, extra);
    },
    warn: (message?: any, extra?: Record<string, any>) => {
      if (log) log.warn(message, extra);
      else console.warn(message, extra);
    },
    debug: (message?: any, extra?: Record<string, any>) => {
      if (log) log.debug(message, extra);
      // Don't log debug to console if log not initialized
    },
  };

  try {
    // Initialize logging (simplified for Legion - always print to console)
    log = Log.create({ service: "legion" });
    
    // Check for updates in background (fire-and-forget)
    checkForUpdates();
    
    // Initialize Global paths
    await Global.init();
    
    // Load configuration
    log!.info(`🛡️  Legion v${version} starting...`);
    const config = await getConfig();
    
    log!.info("🔗 Connecting to server", { serverUrl: config.serverUrl });
    
    // Create socket connection
    // Pass both id and token for faster authentication on server
    const socket: Socket = io(config.serverUrl, {
      auth: {
        id: config.id, // Token ID for faster lookup (optional)
        token: config.token, // Secret token for authentication
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
      log!.info("✅ Connected to server", { socketId: socket.id });
      
      // Send handshake with device info
      const handshakeData = {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        cwd: process.cwd(),
      };
      
      socket.emit("legion:handshake", handshakeData);
      log!.debug("📤 Sent handshake", handshakeData);
    });

    socket.on("connect_error", (err: any) => {
      log!.error("❌ Connection error", { 
        message: err.message,
        type: err.type,
      });
      
      // Check if it's an authentication error
      if (err.message.includes("auth") || err.message.includes("token")) {
        log!.error("🔐 Authentication failed. Please check your token.");
        log!.error("💡 Re-authenticate by updating ~/.tanuki/config.json or LEGION_TOKEN env var");
        process.exit(1);
      }
    });

    socket.on("disconnect", (reason) => {
      log!.warn("⚠️  Disconnected from server", { reason });
      
      if (reason === "io server disconnect") {
        // Server forcibly disconnected, don't reconnect
        log!.error("🚫 Server disconnected this client. Please check your token.");
        process.exit(1);
      }
    });

    // Keep-alive ping/pong
    socket.on("server:ping", (data) => {
      log!.debug("📩 Ping from server", data);
      socket.emit("legion:pong", { ts: Date.now() });
    });

    // Handle reconnection
    socket.on("reconnect", (attemptNumber) => {
      log!.info("🔄 Reconnected to server", { attempt: attemptNumber });
    });

    socket.on("reconnect_attempt", (attemptNumber) => {
      log!.debug("🔄 Reconnection attempt", { attempt: attemptNumber });
    });

    socket.on("reconnect_error", (error) => {
      log!.error("🔄 Reconnection error", { message: error.message });
    });

    socket.on("reconnect_failed", () => {
      log!.error("🔄 Reconnection failed after all attempts");
      process.exit(1);
    });

    // Keep process alive
    process.stdin.resume();

    // Graceful shutdown
    const shutdown = () => {
      log!.info("🛑 Shutting down...");
      socket.disconnect();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Handle uncaught errors
    process.on("unhandledRejection", (reason) => {
      log!.error("Unhandled rejection", { reason });
    });

    process.on("uncaughtException", (error) => {
      log!.error("Uncaught exception", { error: error.message, stack: error.stack });
      shutdown();
    });

  } catch (error) {
    if (error instanceof Error) {
      safeLog.error("Failed to start Legion", { 
        message: error.message,
        stack: error.stack,
      });
      console.error("\n❌", error.message);
      console.error("\n💡 Make sure you have configured your token:");
      console.error("   - Set LEGION_TOKEN environment variable, or");
      console.error("   - Create ~/.tanuki/config.json with your token");
    } else {
      safeLog.error("Failed to start Legion", { error });
      console.error("\n❌ Unknown error occurred");
    }
    process.exit(1);
  }
}

main();
