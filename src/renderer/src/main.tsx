import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ToneLinkAssistant from './components/tonelink-assistant'
import SettingsWindow from './components/settings-window'
import LaughWindow from './components/laugh-window'
import LicenseScreen from './components/license-screen'
import SplashScreen from './components/splash-screen'
import '../styles.css'

const view = new URLSearchParams(window.location.search).get('view')

if (view === 'settings') {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><SettingsWindow /></React.StrictMode>)
} else if (view === 'laughs') {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><LaughWindow /></React.StrictMode>)
} else if (view === 'splash') {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><SplashScreen /></React.StrictMode>)
} else {
  function App() {
    const [licenseState, setLicenseState] = useState<'checking' | 'licensed' | 'unlicensed'>('checking')
    const [licensedPlan, setLicensedPlan] = useState('standard')

    useEffect(() => {
      ;(async () => {
        try {
          const result = await (window as any).nhacApp?.verifyLicense?.()
          if (result?.valid) {
            setLicensedPlan(result.plan ?? 'standard')
            setLicenseState('licensed')
          } else {
            setLicenseState('unlicensed')
          }
        } catch {
          setLicenseState('unlicensed')
        }
      })()
    }, [])

    if (licenseState === 'checking') {
      // Window is already the right size (set by main process based on license.json)
      // Just show a minimal loading indicator
      return (
        <div className="w-full h-full flex items-center justify-center bg-background">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )
    }

    if (licenseState === 'unlicensed') {
      return (
        <LicenseScreen
          onLicensed={async () => {
            // Relaunch so Electron recreates the window as toolbar mode
            await (window as any).nhacApp?.relaunchApp?.()
          }}
        />
      )
    }

    return <ToneLinkAssistant licensedPlan={licensedPlan} />
  }

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
