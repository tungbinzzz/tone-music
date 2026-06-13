/// <reference types="vite/client" />

declare module '*.png' { const src: string; export default src }
declare module '*.jpg' { const src: string; export default src }
declare module '*.jpeg' { const src: string; export default src }
declare module '*.svg' { const src: string; export default src }
declare module '*.webp' { const src: string; export default src }

declare global {
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
  instant_confidence?: number
  instant_strength?: number
  strength?: number
  detector_source?: string
  transition_score?: number
  is_building?: boolean
  state?: string
  midi_should_send?: boolean
  midi_action?: string
  playback_current_time?: number
  playback_duration?: number
  playback_progress_ratio?: number
  debug_timeline?: string
  debug_tail?: Array<Record<string, unknown>>
  source?: string
  mode?: string
  status?: string
  channel?: number
  control?: number
  value?: number
  midi_input_name?: string
  message?: string
}

type FavoriteTransition = {
  time: number
  tone: string
}

type FavoriteSong = {
  videoId: string
  title: string
  url: string
  duration?: number
  mainTone?: string
  completed?: boolean
  completedAt?: string
  transitions?: FavoriteTransition[]
  createdAt?: string
  updatedAt?: string
}

type EngineResponse = {
  ports?: string[]
  midi_input_name?: string
  [key: string]: unknown
}

  interface Window {
    nhacApp: {
      getConfig: () => Promise<AppConfig>
      saveConfig: (config: AppConfig) => Promise<AppConfig>
      listFavorites?: () => Promise<FavoriteSong[]>
      saveFavorite?: (song: FavoriteSong) => Promise<FavoriteSong[]>
      deleteFavorite?: (videoId: string) => Promise<FavoriteSong[]>
      listKnownSongs?: () => Promise<FavoriteSong[]>
      getKnownSong?: (videoId: string) => Promise<FavoriteSong | null>
      saveKnownSong?: (song: FavoriteSong) => Promise<FavoriteSong[]>
      selectCubase: () => Promise<string>
      launchYoutube: (url: string) => Promise<boolean>
      closeYoutube: () => Promise<boolean>
      launchCubase: (path: string) => Promise<boolean>
      exportPreset: (preset: unknown) => Promise<{ saved: boolean; filePath?: string }>
      importPreset: () => Promise<{ imported: boolean; filePath?: string; preset?: unknown }>
      openSettingsWindow: () => Promise<boolean>
      openLaughWindow: () => Promise<boolean>
      openFavoritesWindow?: () => Promise<boolean>
      closeCurrentWindow: () => Promise<boolean>
      setMainWindowSize: (width: number, height: number) => Promise<boolean>
      minimizeWindow: () => Promise<boolean>
      setAlwaysOnTop: (flag: boolean) => Promise<boolean>
      relaunchApp: () => Promise<boolean>
      minimizeCurrentWindow: () => Promise<boolean>
      quitApp: () => Promise<boolean>
      selectAudioFile: () => Promise<string | null>
      readAudioFile: (filePath: string) => Promise<{ ok: boolean; base64?: string; size?: number; error?: string }>
      engineRequest: (command: string, payload?: Record<string, unknown>) => Promise<EngineResponse>
      stopEngineProcess: () => Promise<boolean>
      // License
      activateLicense: (licenseKey: string) => Promise<{ valid: boolean; plan?: string; message?: string }>
      verifyLicense: () => Promise<{ valid: boolean; plan?: string; message?: string; source?: string }>
      deactivateLicense: () => Promise<{ success: boolean; message?: string }>
      checkUpdate: (version?: string) => Promise<{ has_update: boolean; latest_version?: string; url?: string; changelog?: string }>
      getLicenseInfo: () => Promise<{ licenseKey?: string; license_key?: string; plan?: string; offlineTokenExp?: string } | null>
      // YouTube Window
      youtubeTogglePin: () => Promise<boolean>
      youtubeIsPinned: () => Promise<boolean>
      sendYoutubePlaybackState: (payload: { playing: boolean; ended?: boolean; currentTime?: number; duration?: number; progressRatio?: number; title?: string }) => void
      sendYoutubeVideoSelected: (payload: { videoId: string; url: string; title?: string }) => void
      onYoutubeVideoSelected: (callback: (payload: { videoId: string; url: string; title?: string }) => void) => void | (() => void)
      onYoutubePlaybackState: (callback: (payload: { playing: boolean; ended?: boolean; currentTime?: number; duration?: number; progressRatio?: number; title?: string }) => void) => void | (() => void)
      onEngineEvent: (callback: (payload: EngineEvent) => void) => void | (() => void)
      onEngineLog: (callback: (payload: { level?: string; text: string }) => void) => void | (() => void)
      onConfigChanged: (callback: (payload: AppConfig) => void) => void | (() => void)
      onFavoritesChanged?: (callback: (payload: FavoriteSong[]) => void) => void | (() => void)
    }
  }
}

export {}
