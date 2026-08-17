// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";

// Wrap mcpPlugin to normalize the project root path on Windows, preventing path mismatch errors.
const mcp = mcpPlugin();
if (mcp && mcp.configResolved) {
  const originalConfigResolved = mcp.configResolved;
  mcp.configResolved = function (config) {
    const patchedConfig = new Proxy(config, {
      get(target, prop) {
        if (prop === "root" && typeof target.root === "string") {
          return path.resolve(target.root);
        }
        return Reflect.get(target, prop);
      },
    });

    const hook = originalConfigResolved as unknown as
      ((this: unknown, cfg: unknown) => void) | { handler: (this: unknown, cfg: unknown) => void };
    if (typeof hook === "function") {
      hook.call(this, patchedConfig);
    } else if (hook && typeof hook.handler === "function") {
      hook.handler.call(this, patchedConfig);
    }
  };
}

export default defineConfig({
  plugins: [mcp, basicSsl()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
