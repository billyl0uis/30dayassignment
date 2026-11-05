import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { FlaconApp } from './perfume/FlaconApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FlaconApp />
  </StrictMode>,
)
