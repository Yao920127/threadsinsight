import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

/** Python API（vp run api:dev）預設在 8000 埠；開發與預覽時把 /api 代理過去，前端維持同源呼叫。 */
const API_TARGET = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
const apiProxy = { "/api": { target: API_TARGET, changeOrigin: false } };

export default defineConfig({
  // 三個頁面：儀表板（/）、登入頁（/login）、多帳號比較（/compare）
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        login: resolve(import.meta.dirname, "login.html"),
        compare: resolve(import.meta.dirname, "compare.html"),
      },
    },
  },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
