import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Use React's automatic JSX runtime (matches Next.js) so component tests can be
  // rendered with react-dom/server without a `React` global in scope.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // Default to node (fast, no DOM). Component interaction tests opt into jsdom
    // per-file with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
  },
});
