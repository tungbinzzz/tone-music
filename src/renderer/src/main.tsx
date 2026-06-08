import React from 'react'
import { createRoot } from 'react-dom/client'
import ToneLinkAssistant from './components/tonelink-assistant'
import SettingsWindow from './components/settings-window'
import LaughWindow from './components/laugh-window'
import '../styles.css'

const view = new URLSearchParams(window.location.search).get('view')

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'settings' ? <SettingsWindow /> : view === 'laughs' ? <LaughWindow /> : <ToneLinkAssistant />}
  </React.StrictMode>,
)
