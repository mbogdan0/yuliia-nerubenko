import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/yuliia-nerubenko/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        artist: resolve(__dirname, "artist.html")
      }
    }
  },
  publicDir: "data",
  server: {
    host: "127.0.0.1"
  },
  preview: {
    host: "127.0.0.1"
  }
});
