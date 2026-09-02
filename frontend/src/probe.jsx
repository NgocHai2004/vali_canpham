import { createRoot } from 'react-dom/client'
import './styles.css'
import DataCapturePage from './DataCapturePage.jsx'
import { LanguageProvider } from './i18n'

window.__probeErr = []
window.addEventListener('error', e => window.__probeErr.push('ERR: ' + (e.error?.stack || e.message)))

createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <DataCapturePage go={() => {}} initial={null} onDone={() => {}}
      sessionId={null} sessionCode={null} sessionReadOnly={false}
      onSavedInSession={() => {}} onEditProfile={() => {}} />
  </LanguageProvider>
)
