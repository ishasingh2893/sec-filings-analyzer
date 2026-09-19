/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYZER_API_URL?: string;
  readonly NEXT_PUBLIC_ANALYZER_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
