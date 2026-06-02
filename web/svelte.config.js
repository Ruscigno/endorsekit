import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// SvelteKit base path matches the Cloudflared ingress prefix
// (`aviationcortex.com/endorsekit/*` → localhost:3014).
// The gear app doesn't know its public URL; it just serves under this
// prefix and the tunnel rewrites.
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    paths: { base: "/endorsekit" },
  },
};

export default config;
