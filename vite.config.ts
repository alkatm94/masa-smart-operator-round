import netlify from "@netlify/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  plugins: [
    tailwindcss(),
    vinext(),
    // Nitro emits Netlify Functions plus the public assets in dist/.
    // The generic Netlify Vite plugin adds local platform emulation without
    // enabling the legacy Next.js build adapter.
    nitro({ preset: "netlify" }),
    netlify(),
  ],
});
