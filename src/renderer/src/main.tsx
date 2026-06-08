import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ToneLinkAssistant from './components/tonelink-assistant'
import SettingsWindow from './components/settings-window'
import LaughWindow from './components/laugh-window'
import LicenseScreen from './components/license-screen'
import '../styles.css'

const view = new URLSearchParams(window.location.search).get('view')

// Non-main views don't need license check
if (view === 'settings' || view === 'laughs') {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {view === 'settings' ? <SettingsWindow /> : <LaughWindow />}
    </React.StrictMode>,
  )
} else {
  // Main toolbar view — requires license
  function App() {
    const [licenseState, setLicenseState] = useState<'checking' | 'licensed' | 'unlicensed'>('checking')
    const [licensedPlan, setLicensedPlan] = useState<string>('standard')

    useEffect(() => {
      const verify = async () => {
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
      }
      verify()
    }, [])

    if (licenseState === 'checking') {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Đang kiểm tra license...</p>
          </div>
        </div>
      )
    }

    if (licenseState === 'unlicensed') {
      return (
        <LicenseScreen
          onLicensed={(plan) => {
            setLicensedPlan(plan)
            setLicenseState('licensed')
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
