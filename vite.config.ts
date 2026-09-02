import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "src/app"),
      "@features": path.resolve(__dirname, "src/features"),
      "@infrastructure": path.resolve(__dirname, "src/infrastructure"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@generated": path.resolve(__dirname, "src/generated"),
    },
  },
  server: { port: 3000 },
});
