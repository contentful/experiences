import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('The React application root is missing.');

// Reference app: ordinary document navigation; SDK ownership arrives separately.
createRoot(root).render(
  <StrictMode>
    <App pathname={window.location.pathname} />
  </StrictMode>
);
