import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.jsx'
import PreviewWindow from './PreviewWindow.jsx'
import { LanguageProvider } from './i18n'

const isPreviewRoute = new URLSearchParams(window.location.search).get('preview') === '1'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      {isPreviewRoute ? <PreviewWindow /> : <App />}
    </LanguageProvider>
  </StrictMode>,
)
