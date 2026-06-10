import { readFileSync } from "fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

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
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  publicDir: "data",
  server: {
    host: "127.0.0.1"
  },
  preview: {
    host: "127.0.0.1"
  }
});
