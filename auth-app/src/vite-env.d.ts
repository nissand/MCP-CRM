/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Convex client URL, e.g. https://<deployment>.convex.cloud */
  readonly VITE_CONVEX_URL: string;
  /** Convex HTTP actions URL, e.g. https://<deployment>.convex.site */
  readonly VITE_CONVEX_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
