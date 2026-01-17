import os from "os";
import path from "path";
import fs from "fs/promises";

// Simplified Global namespace for Legion (no top-level await)
// Uses ~/.tanuki/ instead of xdg-basedir paths
const app = "legion";

const HOME_DIR = os.homedir();
const data = path.join(HOME_DIR, ".tanuki", "legion");
const cache = path.join(HOME_DIR, ".tanuki", "legion", "cache");
const config = path.join(HOME_DIR, ".tanuki");
const state = path.join(HOME_DIR, ".tanuki", "legion", "state");

export namespace Global {
  export const Path = {
    // Allow override via LEGION_TEST_HOME for test isolation
    get home() {
      return process.env.LEGION_TEST_HOME || os.homedir();
    },
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    state,
  };

  // Lazy initialization - call this in main() instead of top-level await
  export async function init(): Promise<void> {
    await Promise.all([
      fs.mkdir(Path.data, { recursive: true }),
      fs.mkdir(Path.config, { recursive: true }),
      fs.mkdir(Path.state, { recursive: true }),
      fs.mkdir(Path.log, { recursive: true }),
      fs.mkdir(Path.bin, { recursive: true }),
    ]);
  }
}
