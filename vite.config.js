import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "/" for Vercel; "/Personal-Website/" for GitHub Pages
const base = process.env.GITHUB_PAGES ? "/Personal-Website/" : "/";

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
