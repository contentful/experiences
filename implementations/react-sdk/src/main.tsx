import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { PublicEnvironment } from '../public-config';
import { App } from './App';
import { createAttemptLog } from './attempt-log';
import './theme.css';

declare global {
  interface Window {
    ENVIRONMENT: PublicEnvironment;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('The React application root is missing.');
createRoot(root).render(
  <StrictMode>
    <App environment={window.ENVIRONMENT} log={createAttemptLog()} />
  </StrictMode>
);
// Keep the mounted owner and attributed roots alive for Web's final hide drain
// and BFCache. Deliberate in-document removal uses normal React cleanup.
