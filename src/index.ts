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
import { getConfig, updateConfig, type Config, CONFIG_FILE } from "./core/config";
import { Log } from "./util/log";
import { Global } from "./core/global";
import { getSystemFingerprint } from "./util/fingerprint";
import { loadConfig, saveConfig } from "./core/config";

/**
 * Parsed command line arguments
 */
interface ParsedArgs {
  command?: string;
  token?: string;
  version?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--token" && args[i + 1]) {
      parsed.token = args[i + 1];
      i++;
    } else if (args[i] === "auth" && args[i + 1] === "--token" && args[i + 2]) {
      parsed.command = "auth";
      parsed.token = args[i + 2];
      i += 2;
    } else if (args[i] === "login") {
      parsed.command = "login";
    } else if (args[i] === "--version" || args[i] === "-v") {
      parsed.version = true;
    }
  }
  
  return parsed;
}

/**
 * Handle device login flow
 */
async function handleDeviceLogin(
  log: ReturnType<typeof Log.create>,
  serverUrl: string = "https://tanuki.sabw.ru"
): Promise<void> {
  const codeEndpoint = `${serverUrl}/api/v1/legion/device/code`;
  const tokenEndpoint = `${serverUrl}/api/v1/legion/device/token`;
  
  // Step 1: Request device code
  const codeResponse = await fetch(codeEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  
  if (!codeResponse.ok) {
    throw new Error(`Failed to get device code: ${codeResponse.statusText}`);
  }
  
  const { code, activation_url } = await codeResponse.json();
  
  // Step 2: Display to user
  console.log(`👉 Go to: ${activation_url || "https://tanuki.sabw.ru/activate"}`);
  console.log(`🔑 Enter code: ${code}`);
  
  // Step 3: Poll for token
  const pollInterval = 3000; // 3 seconds
  const maxAttempts = 60; // 3 minutes total
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    
    if (tokenResponse.ok) {
      const { token, token_id } = await tokenResponse.json();
      
      // Save token
      const existingConfig = await loadConfig();
      await saveConfig({
        token,
        id: token_id,
        serverUrl: existingConfig?.serverUrl || "wss://tanuki.sabw.ru",
      });
      
      log.info("✅ Device activated successfully");
      return;
    } else if (tokenResponse.status === 202) {
      // Still waiting
      continue;
    } else {
      throw new Error(`Failed to get token: ${tokenResponse.statusText}`);
    }
  }
  
  throw new Error("Device activation timed out");
}

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

/**
 * Enter hibernation mode when auth fails
 * Watches config file for changes and reconnects when updated
 */
async function enterHibernationMode(
  log: ReturnType<typeof Log.create>,
  configFile: string,
  onConfigChanged: () => Promise<void>
): Promise<void> {
  log.warn("⛔ Auth failed. Entering hibernation mode. Waiting for config update...");
  
  // Use fs.watch (Node.js built-in) for file watching
  // In Bun, we need to use fs.watch from fs module
  const fs = await import("fs");
  
  return new Promise((resolve) => {
    const watchHandle = fs.watch(configFile, async (eventType: string) => {
      if (eventType === "change") {
        log.info("📝 Config file changed. Attempting reconnection...");
        try {
          // Small delay to ensure file write is complete
          await new Promise(resolve => setTimeout(resolve, 100));
          await onConfigChanged();
          watchHandle.close();
          resolve();
        } catch (error) {
          log.error("❌ Reconnection failed", { error });
          // Continue watching for next change
        }
      }
    });
  });
}

/**
 * Create socket connection with given config
 */
function createSocket(config: Config): Socket {
  return io(config.serverUrl, {
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
}

/**
 * Token payload received from server (snake_case)
 */
interface ServerTokenPayload {
  token_id: string; // ID записи в БД
  secret: string;   // Сам токен (lg_...)
  timestamp?: string; // Опционально для логов
}

/**
 * Setup socket event handlers
 */
function setupSocketHandlers(
  socket: Socket,
  log: ReturnType<typeof Log.create>,
  fingerprint: string,
  version: string,
  onTokenRotation: () => Promise<void>,
  onReconnect: () => Promise<void>
): void {
  socket.on("connect", () => {
    log.info("✅ Connected to server", { socketId: socket.id });
    
    // Send handshake with device info
    const handshakeData = {
      fingerprint,
      version,
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      cwd: process.cwd(),
    };
    
    socket.emit("legion:handshake", handshakeData);
    log.debug("📤 Sent handshake", handshakeData);
  });

  socket.on("connect_error", (err: any) => {
    log.error("❌ Connection error", { 
      message: err.message,
      type: err.type,
    });
    
    // Check if it's an authentication error
    if (err.message.includes("auth") || err.message.includes("token")) {
      log.error("🔐 Authentication failed. Please check your token.");
      log.error("💡 Re-authenticate by updating ~/.tanuki/config.json or LEGION_TOKEN env var");
      // Enter hibernation mode instead of exiting
      enterHibernationMode(log, CONFIG_FILE, onReconnect).catch((error) => {
        log.error("❌ Hibernation mode failed", { error });
        process.exit(1);
      });
    }
  });

  socket.on("disconnect", (reason) => {
    log.warn("⚠️  Disconnected from server", { reason });
    
    if (reason === "io server disconnect") {
      // Server forcibly disconnected, don't reconnect
      log.error("🚫 Server disconnected this client. Please check your token.");
      // Enter hibernation mode instead of exiting
      enterHibernationMode(log, CONFIG_FILE, onReconnect).catch((error) => {
        log.error("❌ Hibernation mode failed", { error });
        process.exit(1);
      });
    }
  });

  // Handle token rotation
  socket.on("legion:update_token", async (data: ServerTokenPayload) => {
    try {
      log.info("🔄 Received permanent credentials. Persisting...");
      // Map snake_case to camelCase for local config
      await updateConfig({ 
        token: data.secret,      // secret -> token
        id: data.token_id        // token_id -> id
      });
      log.info("✅ Config updated successfully. Reconnecting with new token...");
      
      // Trigger reconnection with new token
      await onTokenRotation();
    } catch (error) {
      log.error("❌ Failed to update config", { error });
      // Continue running even if update fails
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
    
    // Parse command line arguments
    const args = parseArgs();
    
    // Handle login command
    if (args.command === "login") {
      try {
        await handleDeviceLogin(log!);
        process.exit(0);
      } catch (error) {
        log.error("❌ Device login failed", { error });
        process.exit(1);
      }
    }
    
    // Handle --token flag
    if (args.token) {
      log.info("🔑 Saving token from command line...");
      try {
        const defaultServerUrl = process.env.TANUKI_SERVER_URL || "wss://tanuki.sabw.ru";
        // Try to load existing config or create new
        const existingConfig = await loadConfig();
        await saveConfig({
          token: args.token,
          serverUrl: existingConfig?.serverUrl || defaultServerUrl,
          ...(existingConfig?.id ? { id: existingConfig.id } : {}),
        });
        log.info("✅ Token saved successfully");
      } catch (error) {
        log.error("❌ Failed to save token", { error });
        process.exit(1);
      }
      // Continue to normal connection flow
    }
    
    // Check for updates in background (fire-and-forget)
    checkForUpdates();
    
    // Initialize Global paths
    await Global.init();
    
    // Generate device fingerprint
    const fingerprint = await getSystemFingerprint();
    
    // Load configuration
    log!.info(`🛡️  Legion v${version} starting...`);
    let config = await getConfig();
    
    log!.info("🔗 Connecting to server", { serverUrl: config.serverUrl });
    
    // Track current socket and token rotation state
    let currentSocket: Socket;
    let isTokenRotation = false;
    
    // Declare functions first to avoid temporal dead zone
    let handleTokenRotation: () => Promise<void>;
    let handleReconnect: () => Promise<void>;
    
    // Function to handle reconnection (used by hibernation mode and token rotation)
    handleReconnect = async () => {
      // Disconnect existing socket if any
      if (currentSocket) {
        currentSocket.io.opts.reconnection = false;
        currentSocket.disconnect();
        currentSocket.removeAllListeners();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Load config (may have been updated)
      const newConfig = await getConfig();
      log!.info("🔄 Reconnecting...");
      
      // Create new socket with updated config
      currentSocket = createSocket(newConfig);
      setupSocketHandlers(currentSocket, log!, fingerprint, version, handleTokenRotation, handleReconnect);
      
      config = newConfig;
    };
    
    // Function to handle token rotation and reconnect
    handleTokenRotation = async () => {
      isTokenRotation = true;
      await handleReconnect();
      isTokenRotation = false;
    };
    
    // Create initial socket connection
    currentSocket = createSocket(config);
    setupSocketHandlers(currentSocket, log!, fingerprint, version, handleTokenRotation, handleReconnect);
    
    // Keep process alive
    process.stdin.resume();

    // Graceful shutdown
    const shutdown = () => {
      log!.info("🛑 Shutting down...");
      currentSocket.disconnect();
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
