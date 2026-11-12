import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { missingRuntimeFeatures, StartupBoundary, StartupHelp } from './components/StartupSupport';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';

const missing = missingRuntimeFeatures();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupBoundary>
      {missing.length ? <StartupHelp missing={missing} /> : <App />}
    </StartupBoundary>
  </React.StrictMode>,
);
