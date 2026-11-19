/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 的網址前綴；預設為空字串（同源，由 vp dev 或 nginx 轉送 /api）。 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
