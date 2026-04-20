import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Must match GitHub repository name for project Pages:
// https://<user>.github.io/<REPO>/
export default defineConfig({
  plugins: [react()],
  base: "/Personal-Website/",
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
