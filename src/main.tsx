import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import App from './App';
import './index.css';
import Toaster from './components/ui/Toaster';
import { loadFromShareHash } from './utils/share';

// Use the locally installed monaco-editor instead of the CDN so that the
// editor works without internet access.
loader.config({ monaco });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
      <Toaster />
    </ReactFlowProvider>
  </React.StrictMode>
);

// Load a shared board from the URL hash once the store has initialised.
setTimeout(loadFromShareHash, 0);
