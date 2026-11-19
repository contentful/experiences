/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACE_ID?: string;
  readonly VITE_DESTINATION_ID?: string;
  readonly VITE_ENVIRONMENT_ID?: string;
  readonly VITE_CDA_TOKEN?: string;
  readonly VITE_DELIVERY_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
