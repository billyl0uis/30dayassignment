import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import App from './App';
import { initCsg } from './engine/csg';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

// Booleans and shells need the geometry engine, so load it before the first build.
initCsg(wasmUrl)
  .catch((e) => console.error('Geometry engine failed to load; booleans and shells will show an error.', e))
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
