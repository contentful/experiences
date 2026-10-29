import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadPageContent } from './content-loader';
import type { PublicEnvironment } from '../public-config';
import './theme.css';

declare global {
  interface Window {
    ENVIRONMENT: PublicEnvironment;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('The React application root is missing.');

// Explicit application-owned loader, once per document. React Strict Mode can
// replay presentation effects without issuing a second set of content requests.
const pathname = window.location.pathname;
const content = loadPageContent(window.ENVIRONMENT, pathname);
createRoot(root).render(
  <StrictMode>
    <App pathname={pathname} environment={window.ENVIRONMENT} content={content} />
  </StrictMode>
);
