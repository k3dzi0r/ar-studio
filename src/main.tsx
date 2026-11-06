import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { requestPersistentStorage } from './pwa/pwa'

registerSW({ immediate: true }) // precaches the whole app → works offline after first load
requestPersistentStorage()

// No StrictMode: its dev double-mount would open/close the camera twice.
createRoot(document.getElementById('root')!).render(<App />)
