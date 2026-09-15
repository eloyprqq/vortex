import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  server: {
    port: 5173,
    host: true,
    watch: {
      // Screen recordings dropped in the project root lock the file while
      // being written, which kills the watcher with EBUSY on Windows.
      ignored: ["**/*.mp4", "**/*.mkv", "**/*.webm", "**/*.mov"],
    },
  },
});
