import path from "path"
import os from "os"

export async function data() {
  const envPath = Bun.env.MODELS_DEV_API_JSON
  if (envPath) {
    const file = Bun.file(envPath)
    if (await file.exists()) {
      return await file.text()
    }
  }
  if (Bun.env.OPENCODE_DISABLE_MODELS_FETCH) {
    const cacheDir = Bun.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache")
    const cacheFile = Bun.file(path.join(cacheDir, "legion", "models.json"))
    if (await cacheFile.exists()) {
      return await cacheFile.text()
    }
    return "{}"
  }
  try {
    return await fetch("https://models.dev/api.json").then((x) => x.text())
  } catch {
    const cacheDir = Bun.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache")
    const cacheFile = Bun.file(path.join(cacheDir, "legion", "models.json"))
    if (await cacheFile.exists()) {
      return await cacheFile.text()
    }
    return "{}"
  }
}
