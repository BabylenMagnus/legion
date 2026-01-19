import * as os from "os";

let cachedFingerprint: string | null = null;

/**
 * Generate a stable unique identifier for this device
 * Uses system information (hostname, platform, arch, CPU, MAC address)
 * Hashed with SHA-256 to create a consistent fingerprint
 */
export async function getSystemFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const cpuModel = os.cpus()[0]?.model || "unknown";
  
  // Get first non-loopback MAC address
  const interfaces = os.networkInterfaces();
  let macAddress = "";
  for (const iface of Object.values(interfaces || {})) {
    for (const addr of iface || []) {
      if (!addr.internal && addr.mac && addr.mac !== "00:00:00:00:00:00") {
        macAddress = addr.mac;
        break;
      }
    }
    if (macAddress) break;
  }
  
  // Combine all data into a single string
  const data = JSON.stringify({ hostname, platform, arch, cpuModel, macAddress });
  
  // Hash with SHA-256 using Web Crypto API
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  
  // Convert to hex string
  cachedFingerprint = Buffer.from(hashBuffer).toString("hex");
  
  return cachedFingerprint;
}
