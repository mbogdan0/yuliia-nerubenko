import { defineConfig } from "vite";

export default defineConfig({
  base: "/yuliia-nerubenko/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        artist: "artist.html"
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
