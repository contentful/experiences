/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACE_ID?: string;
  readonly VITE_ENVIRONMENT_ID?: string;
  readonly VITE_CDA_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
