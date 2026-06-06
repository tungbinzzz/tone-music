/// <reference types="vite/client" />

type AppConfig = {
  youtubeUrl?: string
  cubasePath?: string
  pythonPath?: string
  midiOutputName?: string
  midiInputName?: string
  autoSendKey?: boolean
  autoLaunchYoutube?: boolean
  autoLaunchCubase?: boolean
}

type EngineEvent = {
  type?: string
  key?: string
  confidence?: number
  analysis_ms?: number
  window_seconds?: number
  key_votes?: number
  min_key_votes?: number
  instant_key?: string
  source?: string
  mode?: string
  status?: string
  channel?: number
  control?: number
  value?: number
  midi_input_name?: string
  message?: string
}

type EngineResponse = {
  ports?: string[]
  midi_input_name?: string
  [key: string]: unknown
}

declare global {
  interface Window {
    nhacApp: {
      getConfig: () => Promise<AppConfig>
      saveConfig: (config: AppConfig) => Promise<AppConfig>
      selectCubase: () => Promise<string>
      launchYoutube: (url: string) => Promise<boolean>
      closeYoutube: () => Promise<boolean>
      launchCubase: (path: string) => Promise<boolean>
      exportPreset: (preset: unknown) => Promise<{ saved: boolean; filePath?: string }>
      importPreset: () => Promise<{ imported: boolean; filePath?: string; preset?: unknown }>
      openSettingsWindow: () => Promise<boolean>
      closeCurrentWindow: () => Promise<boolean>
      setMainWindowSize: (width: number, height: number) => Promise<boolean>
      engineRequest: (command: string, payload?: Record<string, unknown>) => Promise<EngineResponse>
      stopEngineProcess: () => Promise<boolean>
      onYoutubeVideoSelected: (callback: (payload: { videoId: string; url: string }) => void) => void
      onEngineEvent: (callback: (payload: EngineEvent) => void) => void
      onEngineLog: (callback: (payload: { level?: string; text: string }) => void) => void
    }
  }
}

export {}
