import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [vue(), viteSingleFile()],
});
