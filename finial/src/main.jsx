import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { JarApp } from './jar/JarApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <JarApp />
  </StrictMode>,
)
