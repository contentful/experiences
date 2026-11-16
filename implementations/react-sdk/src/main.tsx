import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAttemptLog } from './attempt-log';
import { loadPageContent } from './content-loader';
import { ExperiencesRoot } from './experiences';
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
const log = createAttemptLog();
const environment = window.ENVIRONMENT;
const reactRoot = createRoot(root);
reactRoot.render(
  <StrictMode>
    <ExperiencesRoot
      spaceId={environment.SPACE_ID}
      environmentId={environment.ENVIRONMENT_ID}
      locale={environment.LOCALE}
      delivery={{ accessToken: environment.CDA_TOKEN }}
      onStatesReady={log.onStatesReady}
    >
      <App pathname={pathname} environment={environment} content={content} log={log} />
    </ExperiencesRoot>
  </StrictMode>
);
// Web owns interaction completion and its final hide/unload flush. Keep the
// React owner and attributed roots alive during that drain; document teardown
// releases them. BFCache retains the same mounted owner for resumption.
// Deliberate unmount/replacement inside a live document uses provider cleanup.
