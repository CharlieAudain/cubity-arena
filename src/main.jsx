import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Silence logs and warnings as requested
console.warn = () => {};
console.log = () => {};

import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
