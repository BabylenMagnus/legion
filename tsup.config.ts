import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"], // CJS is critical for maximum CLI compatibility
  target: "node18", // Target LTS versions of Node.js
  clean: true, // Remove dist folder before build
  dts: false, // Don't generate .d.ts files for CLI
  sourcemap: false, // Disable sourcemap to reduce size
  minify: false, // Don't minify for better debugging
  outDir: "dist",
  bundle: true, // Bundle all dependencies into a single file
  tsconfig: "tsconfig.build.json", // Use separate tsconfig for build
  // Shebang is already in src/index.ts, tsup will preserve it automatically
  external: [
    // Exclude native modules that must be installed separately
    "better-sqlite3",
  ],
});
