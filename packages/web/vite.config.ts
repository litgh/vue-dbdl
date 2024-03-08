import path from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import viteDts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    viteDts({
      insertTypesEntry: true,
      staticImport: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
