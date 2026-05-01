import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
//
// IMPORTANT — GitHub Pages base path:
//  - If your repo is named `<username>.github.io`  → base: "/"
//  - If your repo is a project repo (e.g. `portfolio`) → base: "/portfolio/"
//
// Adjust the line below to match the repo you push to.
export default defineConfig({
  base: "/portfolio/",
  plugins: [react()],
});
