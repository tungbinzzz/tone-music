import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import logo from '../../../assets/logo.png'
import {
  Settings,
  ExternalLink,
  Play,
  Square,
  Send,
  Music,
  Mic,
  Volume2,
  Timer,
  Waves,
  Sparkles,
  Radio,
  Disc3,
  RefreshCw,
  FolderOpen,
  ChevronDown,
  Minus,
  Plus,
  Smile,
  X,
  Clock,
  Gauge,
  Pin,
  PinOff,
} from 'lucide-react'

const KEY_TO_INDEX: Record<string, number> = {
  C: 0,
  'C#': 12,
  Db: 12,
  D: 23,
  'D#': 35,
  Eb: 35,
  E: 46,
  F: 58,
  'F#': 69,
  Gb: 69,
  G: 81,
  'G#': 92,
  Ab: 92,
  A: 104,
  'A#': 115,
  Bb: 115,
  B: 126,
}

const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function parseKey(keyName: string) {
  if (!keyName || keyName === '--') return null
  const match = keyName.trim().match(/^([A-G](?:#|b)?)\s*(.*)$/i)
  if (!match) return null
  let note = match[1].replace(/^([a-g])/, (letter) => letter.toUpperCase())
  const scale = (match[2] || '').trim()

  const norm: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
    'db': 'C#', 'eb': 'D#', 'gb': 'F#', 'ab': 'G#', 'bb': 'A#',
  }
  note = norm[note] || note
  return { note, scale }
}

function shiftKey(keyName: string, semitones: number): string {
  if (!keyName || keyName === '--' || semitones === 0) return keyName
  const parsed = parseKey(keyName)
  if (!parsed) return keyName
  const noteIndex = CHROMATIC_NOTES.indexOf(parsed.note)
  if (noteIndex === -1) return keyName

  let nextIndex = noteIndex + semitones
  nextIndex = Math.max(0, Math.min(CHROMATIC_NOTES.length - 1, nextIndex))
  const nextNote = CHROMATIC_NOTES[nextIndex]
  return parsed.scale ? `${nextNote} ${parsed.scale}` : nextNote
}


const SCALE_VALUE_BY_NAME: Record<string, number> = {
  major: 0,
  minor: 5,
  chromatic: 9,
}

type ControlKey = 'beat' | 'mic' | 'vang'
type VolumeKey = 'beat' | 'mic' | 'vang' | 'vangNgan' | 'delay'
type EffectKey = 'tune' | 'lofi' | 'remix'

const PITCH_CC_MIN = 0
const PITCH_CC_MAX = 48
const PITCH_DISPLAY_MIN = -6
const PITCH_DISPLAY_MAX = 6
const PITCH_CC_CENTER = 24
const PITCH_CC_STEP = 2

type EngineEvent = {
  key?: string
  confidence?: number
  analysis_ms?: number
  key_votes?: number
  min_key_votes?: number
  midi_should_send?: boolean
  midi_action?: string
  state?: string
  instant_key?: string
}

const fallbackNhacApp: Window['nhacApp'] = {
  getConfig: async () => ({}),
  saveConfig: async (config) => config,
  selectCubase: async () => '',
  launchYoutube: async () => false,
  closeYoutube: async () => false,
  launchCubase: async () => false,
  exportPreset: async () => ({ saved: false }),
  importPreset: async () => ({ imported: false }),
  openSettingsWindow: async () => false,
  openLaughWindow: async () => false,
  closeCurrentWindow: async () => false,
  setMainWindowSize: async () => false,
  engineRequest: async (command) => {
    if (command === 'list_midi_outputs' || command === 'list_midi_inputs') return { ports: [] }
    return {}
  },
  stopEngineProcess: async () => false,
  onYoutubeVideoSelected: () => {},
  onEngineEvent: () => {},
  onEngineLog: () => {},
  onConfigChanged: () => {},
  minimizeWindow: async () => false,
  setAlwaysOnTop: async () => false,
  relaunchApp: async () => false,
  quitApp: async () => false,
  activateLicense: async () => ({ valid: false, message: 'No IPC' }),
  verifyLicense: async () => ({ valid: false, message: 'No IPC' }),
  deactivateLicense: async () => ({ success: false }),
  checkUpdate: async () => ({ has_update: false }),
  getLicenseInfo: async () => null,
}

type VolumeControlProps = {
  value: number
  onChange: (value: number) => void
  icon: React.ReactNode
  label: string
  description?: string
  max?: number
  onPopupChange?: (isOpen: boolean) => void
}

type ParameterControlProps = {
  value: number
  onChange: (value: number) => void
  icon: React.ReactNode
  label: string
  description?: string
  max?: number
  onPopupChange?: (isOpen: boolean) => void
}

function clampMidiValue(value: number, max = 127) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.round(value), 0), max)
}

function pitchDisplayToCc(value: number) {
  const safeValue = Math.min(Math.max(Math.round(value), PITCH_DISPLAY_MIN), PITCH_DISPLAY_MAX)
  return Math.min(Math.max(PITCH_CC_CENTER + safeValue * PITCH_CC_STEP, PITCH_CC_MIN), PITCH_CC_MAX)
}

function pitchCcToDisplay(value: number) {
  const safeValue = clampMidiValue(value, PITCH_CC_MAX)
  return Math.min(Math.max(Math.round((safeValue - PITCH_CC_CENTER) / PITCH_CC_STEP), PITCH_DISPLAY_MIN), PITCH_DISPLAY_MAX)
}

function VolumeControl({ value, onChange, icon, label, description, max = 127, onPopupChange }: VolumeControlProps) {
  const [isOpen, setIsOpen] = useState(false)
  const percentage = (value / max) * 100
  const displayPercentage = Math.round(percentage)

  const setPopupOpen = (nextOpen: boolean) => {
    setIsOpen((current) => {
      if (current === nextOpen) return current
      onPopupChange?.(nextOpen)
      return nextOpen
    })
  }

  const openPopup = () => {
    setPopupOpen(true)
  }

  return (
    <div
      className="relative"
      onMouseEnter={openPopup}
      onMouseLeave={() => setPopupOpen(false)}
    >
      <button
        className={`p-1.5 rounded-md transition-all duration-200 ${
          isOpen ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title={description ? `${label}: ${description}` : label}
      >
        {icon}
      </button>

      {isOpen && (
        <div
          aria-hidden="true"
          onMouseEnter={openPopup}
          className="absolute top-full left-1/2 z-40 h-2 w-[128px] -translate-x-1/2"
        />
      )}

      <div
        onMouseEnter={openPopup}
        className={`no-drag absolute top-full left-1/2 -translate-x-1/2 mt-1 transition-all duration-200 z-50 ${
          isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2'
        }`}
      >
        <div className="bg-card border border-border rounded-lg p-2 shadow-xl shadow-black/20 min-w-[120px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>
            <span className="text-[10px] font-mono text-primary">{displayPercentage}%</span>
          </div>
          {description && (
            <p className="mb-1.5 text-[9px] leading-tight text-muted-foreground">{description}</p>
          )}
          <div className="relative h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/80 to-primary rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <input
            type="range"
            min="0"
            max={max}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full mt-1 h-1 opacity-0 cursor-pointer absolute inset-x-0 bottom-2"
          />
        </div>
        <div className="w-2 h-2 bg-card border-t border-l border-border rotate-45 absolute left-1/2 -translate-x-1/2 -top-1 pointer-events-none" />
      </div>
    </div>
  )
}

function ParameterControl({ value, onChange, icon, label, description, max = 127, onPopupChange }: ParameterControlProps) {
  const [isOpen, setIsOpen] = useState(false)
  const percentage = Math.round((value / max) * 100)

  const setPopupOpen = (nextOpen: boolean) => {
    setIsOpen((current) => {
      if (current === nextOpen) return current
      onPopupChange?.(nextOpen)
      return nextOpen
    })
  }

  const openPopup = () => {
    setPopupOpen(true)
  }

  return (
    <div
      className="relative"
      onMouseEnter={openPopup}
      onMouseLeave={() => setPopupOpen(false)}
    >
      <button
        className={`p-1.5 rounded-md transition-all duration-200 ${
          isOpen ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title={description ? `${label}: ${description}` : label}
      >
        {icon}
      </button>

      {isOpen && (
        <div
          aria-hidden="true"
          onMouseEnter={openPopup}
          className="absolute top-full left-1/2 z-40 h-2 w-[128px] -translate-x-1/2"
        />
      )}

      <div
        onMouseEnter={openPopup}
        className={`no-drag absolute top-full left-1/2 -translate-x-1/2 mt-1 transition-all duration-200 z-50 ${
          isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2'
        }`}
      >
        <div className="bg-card border border-border rounded-lg p-2 shadow-xl shadow-black/20 min-w-[120px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>
            <span className="text-[10px] font-mono text-primary">{percentage}%</span>
          </div>
          {description && (
            <p className="mb-1.5 text-[9px] leading-tight text-muted-foreground">{description}</p>
          )}
          <div className="relative h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/80 to-primary rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <input
            type="range"
            min="0"
            max={max}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full mt-1 h-1 opacity-0 cursor-pointer absolute inset-x-0 bottom-2"
          />
        </div>
        <div className="w-2 h-2 bg-card border-t border-l border-border rotate-45 absolute left-1/2 -translate-x-1/2 -top-1 pointer-events-none" />
      </div>
    </div>
  )
}

function PitchShiftControl({
  value,
  onChange,
  tone,
}: {
  value: number
  onChange: (value: number) => void
  tone: string
}) {
  const parsed = parseKey(tone)
  const noteIndex = parsed ? CHROMATIC_NOTES.indexOf(parsed.note) : -1

  let canDecrease = value > PITCH_DISPLAY_MIN
  let canIncrease = value < PITCH_DISPLAY_MAX

  if (parsed && noteIndex !== -1) {
    if (noteIndex === 0) {
      canDecrease = false
    }
    if (noteIndex === CHROMATIC_NOTES.length - 1) {
      canIncrease = false
    }
  }

  return (
    <div className="no-drag flex items-center gap-0.5 rounded-md bg-background border border-border px-1 py-0.5">
      <button
        onClick={() => canDecrease && onChange(value - 1)}
        disabled={!canDecrease}
        className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        title="Giảm tông nhạc"
      >
        <Minus className="h-3 w-3" />
      </button>
      <div className="min-w-[34px] text-center font-mono text-[11px] font-bold text-primary">
        {value > 0 ? `+${value}` : value}
      </div>
      <button
        onClick={() => canIncrease && onChange(value + 1)}
        disabled={!canIncrease}
        className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        title="Tăng tông nhạc"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 cursor-pointer ${
        active ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
      title={`${active ? 'Bấm để tắt' : 'Bấm để bật'} ${label}`}
    >
      {active ? 'Tắt' : 'Bật'} {label}
    </button>
  )
}

function EffectBtn({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 border cursor-pointer ${
        active ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50'
      }`}
      title={`${active ? 'Bấm để tắt' : 'Bấm để bật'} ${label}`}
    >
      {icon}
      {active ? 'Tắt' : 'Bật'} {label}
    </button>
  )
}

export default function ToneLinkAssistant() {
  const [toneData, setToneData] = useState({ tone: '--', confidence: 0, isDetecting: false })
  const [analysis, setAnalysis] = useState({ latency: '--', window: '--', instant: '--' })
  const [controls, setControls] = useState({ beat: false, mic: false, vang: true })
  const [volumes, setVolumes] = useState({ beat: 90, mic: 90, vang: 55, vangNgan: 45, delay: 35 })
  const [effects, setEffects] = useState({ tune: false, lofi: false, remix: false })
  const [pitchShift, setPitchShift] = useState(0)
  const [returnSpeed, setReturnSpeed] = useState(64)
  const [autoSendKey, setAutoSendKey] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(() => localStorage.getItem('toolbar-always-on-top') === 'true')
  const [currentTime, setCurrentTime] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'midi' | 'config'>('midi')
  const [saveStatus, setSaveStatus] = useState('')
  const [midiOutputs, setMidiOutputs] = useState<string[]>([])
  const [midiInputs, setMidiInputs] = useState<string[]>([])
  const [midiSettings, setMidiSettings] = useState({ output: '', feedbackInput: '' })
  const [configSettings, setConfigSettings] = useState({
    youtubeUrl: 'https://www.youtube.com',
    pythonPath: 'python',
    cubasePath: '',
    autoOpenYoutube: true,
    autoOpenCubase: true,
  })
  const lastAutoSentKey = useRef('')
  const autoSendKeyRef = useRef(autoSendKey)
  const didStartupGenericSync = useRef(false)
  const isConfigLoaded = useRef(false)
  const lastYoutubeVideoId = useRef('')
  const isLiveRef = useRef(isLive)
  useEffect(() => {
    isLiveRef.current = isLive
  }, [isLive])

  const pitchShiftRef = useRef(pitchShift)
  useEffect(() => {
    pitchShiftRef.current = pitchShift
  }, [pitchShift])

  const lastPitchShift = useRef(pitchShift)
  useEffect(() => {
    const diff = pitchShift - lastPitchShift.current
    lastPitchShift.current = pitchShift
    if (diff === 0) return

    setToneData((current) => {
      if (current.tone === '--') return current
      const parsed = parseKey(current.tone)
      if (!parsed) return current
      const noteIndex = CHROMATIC_NOTES.indexOf(parsed.note)
      if (noteIndex === -1) return current
      const nextNoteIndex = Math.max(0, Math.min(CHROMATIC_NOTES.length - 1, noteIndex + diff))
      const nextNote = CHROMATIC_NOTES[nextNoteIndex]
      const nextKey = parsed.scale ? `${nextNote} ${parsed.scale}` : nextNote

      sendKeyScaleToCubase('pitch_shift', nextKey).catch(console.error)

      return { ...current, tone: nextKey }
    })
  }, [pitchShift])

  const toolbarRef = useRef<HTMLDivElement>(null)
  const nhacApp = useMemo(() => window.nhacApp ?? fallbackNhacApp, [])
  const [volumePopupOpen, setVolumePopupOpen] = useState(false)

  const handleVolumePopupChange = useCallback((nextOpen: boolean) => {
    setVolumePopupOpen(nextOpen)
  }, [])

  const cc = useMemo(
    () => ({
      controls: { beat: 40, mic: 41, vang: 42 },
      volumes: { beat: 50, mic: 51, vang: 52, vangNgan: 53, delay: 54 },
      effects: { tune: 27, lofi: 25, remix: 22 },
      pitchShift: 7,
      returnSpeed: 6,
    }),
    [],
  )

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString('vi-VN', { hour12: true }))
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Sync alwaysOnTop state with Electron and localStorage
  useEffect(() => {
    localStorage.setItem('toolbar-always-on-top', String(alwaysOnTop))
    nhacApp.setAlwaysOnTop?.(alwaysOnTop)
  }, [alwaysOnTop, nhacApp])

  useEffect(() => {
    autoSendKeyRef.current = autoSendKey
  }, [autoSendKey])

  useEffect(() => {
    const unsubscribe = nhacApp.onYoutubeVideoSelected((payload) => {
      if (!payload.videoId || payload.videoId === lastYoutubeVideoId.current) return
      lastYoutubeVideoId.current = payload.videoId
      startToneDetection().catch((error) => {
        console.error('Không trigger được dò tone từ YouTube:', error)
      })
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [nhacApp])

  // Auto start/stop tone detection based on YouTube playback state
  useEffect(() => {
    const unsubscribe = nhacApp.onYoutubePlaybackState?.((payload) => {
      nhacApp.engineRequest('set_playback_position', {
        current_time: payload.currentTime || 0,
        duration: payload.duration || 0,
        progress_ratio: payload.progressRatio || 0,
        playing: Boolean(payload.playing),
      }).catch(() => {})

      if (payload.playing) {
        if (!isLiveRef.current) {
          startToneDetection().catch(() => {})
        }
      } else {
        if (isLiveRef.current) {
          stopToneDetection()
        }
      }
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [nhacApp])

  useEffect(() => {
    const resizeWindow = () => {
      const toolbar = toolbarRef.current
      if (!toolbar || !nhacApp.setMainWindowSize) return

      const rect = toolbar.getBoundingClientRect()
      const windowPadding = 12
      const popupSpace = volumePopupOpen ? 76 : 0
      nhacApp.setMainWindowSize(
        Math.ceil(rect.width + windowPadding),
        Math.ceil(rect.height + popupSpace + windowPadding),
      ).catch(() => {})
    }

    resizeWindow()
    const observer = new ResizeObserver(resizeWindow)
    if (toolbarRef.current) observer.observe(toolbarRef.current)
    window.addEventListener('resize', resizeWindow)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resizeWindow)
    }
  }, [nhacApp, volumePopupOpen])

  useEffect(() => {
    function applyConfig(config: AppConfig) {
      setAutoSendKey(true)
      const feedbackInput = config.midiInputName || ''
      const midiOutput = config.midiOutputName || ''
      setMidiSettings({
        output: midiOutput,
        feedbackInput,
      })
      setConfigSettings({
        youtubeUrl: config.youtubeUrl || 'https://www.youtube.com',
        pythonPath: config.pythonPath || 'python',
        cubasePath: config.cubasePath || '',
        autoOpenYoutube: Boolean(config.autoLaunchYoutube),
        autoOpenCubase: Boolean(config.autoLaunchCubase),
      })
      if (midiOutput) {
        setMidiOutputs([midiOutput])
        sendStartupGenericDefaults(midiOutput).catch(console.error)
      }
      if (feedbackInput) {
        setMidiInputs([feedbackInput])
      }
      isConfigLoaded.current = true
    }

    nhacApp.getConfig().then((config) => {
      applyConfig(config)
      const feedbackInput = config.midiInputName || ''
      const midiOutput = config.midiOutputName || ''
      if (midiOutput) {
        nhacApp.engineRequest('configure', { midi_output_name: midiOutput }).catch(console.error)
        sendStartupGenericDefaults(midiOutput).catch(console.error)
      }
      if (feedbackInput) {
        nhacApp.engineRequest('start_midi_feedback', { midi_input_name: feedbackInput }).catch(console.error)
      }
    })

    const unsubscribeConfig = nhacApp.onConfigChanged((config) => {
      applyConfig(config)
    })

    const unsubscribeEngine = nhacApp.onEngineEvent((event) => {
      if (event.type === 'tone') {
        const confidence = Math.round((event.confidence || 0) * 100)
        const nextTone = event.key || '--'
        const shiftedTone = shiftKey(nextTone, pitchShiftRef.current)
        setToneData({ tone: shiftedTone, confidence, isDetecting: true })
        setAnalysis({
          latency: event.analysis_ms === undefined ? '--' : String(event.analysis_ms),
          window: event.key_votes === undefined ? '--' : `${event.key_votes}/${event.min_key_votes ?? '--'}`,
          instant: event.instant_key || '--',
        })
        autoSendDetectedKey(shiftedTone, event).catch(console.error)
      }

      if (event.type === 'analyzer_status') {
        setToneData((current) => ({ ...current, isDetecting: true }))
        setAnalysis((current) => ({
          ...current,
          window: event.window_seconds === undefined ? current.window : `${event.window_seconds} s`,
        }))
      }

      if (event.type === 'midi_feedback') {
        applyMidiFeedback(Number(event.control), Number(event.value))
      }
    })

    return () => {
      if (typeof unsubscribeConfig === 'function') unsubscribeConfig()
      if (typeof unsubscribeEngine === 'function') unsubscribeEngine()
    }
  }, [nhacApp])

  async function applyRuntimeConfig(saved: AppConfig) {
    if (saved.midiOutputName) {
      await nhacApp.engineRequest('configure', { midi_output_name: saved.midiOutputName })
    }
    if (saved.midiInputName) {
      await nhacApp.engineRequest('start_midi_feedback', { midi_input_name: saved.midiInputName })
    }
  }

  async function saveConfig(next = configSettings, midi = midiSettings, auto = true, showSavedStatus = false) {
    if (!isConfigLoaded.current) {
      console.warn('[ToneLinkAssistant] Config not loaded yet, ignoring saveConfig to prevent overwriting with defaults.')
      return {
        youtubeUrl: next.youtubeUrl,
        pythonPath: next.pythonPath,
        cubasePath: next.cubasePath,
        autoLaunchYoutube: next.autoOpenYoutube,
        autoLaunchCubase: next.autoOpenCubase,
        midiOutputName: midi.output,
        midiInputName: midi.feedbackInput,
        autoSendKey: true,
      }
    }

    const saved = await nhacApp.saveConfig({
      youtubeUrl: next.youtubeUrl,
      pythonPath: next.pythonPath,
      cubasePath: next.cubasePath,
      autoLaunchYoutube: next.autoOpenYoutube,
      autoLaunchCubase: next.autoOpenCubase,
      midiOutputName: midi.output,
      midiInputName: midi.feedbackInput,
      autoSendKey: true,
    })

    setConfigSettings({
      youtubeUrl: saved.youtubeUrl || next.youtubeUrl,
      pythonPath: saved.pythonPath || next.pythonPath,
      cubasePath: saved.cubasePath || next.cubasePath,
      autoOpenYoutube: Boolean(saved.autoLaunchYoutube),
      autoOpenCubase: Boolean(saved.autoLaunchCubase),
    })
    setMidiSettings({
      output: saved.midiOutputName || midi.output,
      feedbackInput: saved.midiInputName || midi.feedbackInput,
    })
    if (showSavedStatus) {
      await applyRuntimeConfig(saved)
      if (!saved.autoLaunchYoutube) {
        await nhacApp.closeYoutube()
      }
      setSaveStatus('Đã lưu cài đặt')
    }
    return saved
  }

  function saveConfigField<K extends keyof typeof configSettings>(key: K, value: (typeof configSettings)[K]) {
    const next = { ...configSettings, [key]: value }
    setSaveStatus('')
    setConfigSettings(next)
  }

  async function sendStartupGenericDefaults(outputName: string) {
    if (didStartupGenericSync.current || !outputName) return
    didStartupGenericSync.current = true

    setEffects({ tune: false, lofi: false, remix: false })
    setPitchShift(0)

    const startupMessages = [
      { label: 'startup tune off', control: cc.effects.tune, value: 0 },
      { label: 'startup lofi off', control: cc.effects.lofi, value: 0 },
      { label: 'startup remix off', control: cc.effects.remix, value: 0 },
      { label: 'startup tang_tong zero', control: cc.pitchShift, value: pitchDisplayToCc(0) },
    ]

    for (const message of startupMessages) {
      await nhacApp.engineRequest('set_cubase_cc', {
        channel: 0,
        control: message.control,
        value: message.value,
        midi_output_name: outputName,
      })
      console.log(`Sent ${message.label}: CC${message.control}=${message.value}`)
    }
  }

  async function sendMidi(label: string, control: number, value: number) {
    const saved = await saveConfig()
    await nhacApp.engineRequest('set_cubase_cc', {
      channel: 0,
      control,
      value,
      midi_output_name: saved.midiOutputName || midiSettings.output,
    })
    console.log(`Sent ${label}: CC${control}=${value}`)
  }

  async function toggleControl(key: ControlKey) {
    const nextValue = controls[key] ? 0 : 127
    setControls((current) => ({ ...current, [key]: !current[key] }))
    await sendMidi(key, cc.controls[key], nextValue)
  }

  async function toggleEffect(key: EffectKey) {
    const nextValue = effects[key] ? 0 : 127
    setEffects((current) => ({ ...current, [key]: !current[key] }))
    await sendMidi(key, cc.effects[key], nextValue)
  }

  async function updateVolume(key: VolumeKey, value: number) {
    setVolumes((current) => ({ ...current, [key]: value }))
    await sendMidi(key, cc.volumes[key], value)
  }

  async function updatePitchShift(value: number) {
    const nextValue = Math.min(Math.max(Math.round(value), PITCH_DISPLAY_MIN), PITCH_DISPLAY_MAX)
    const diff = nextValue - pitchShift
    setPitchShift(nextValue)
    await sendMidi('tang_tong', cc.pitchShift, pitchDisplayToCc(nextValue))

    if (diff !== 0 && toneData.tone !== '--') {
      const parsed = parseKey(toneData.tone)
      if (parsed) {
        const noteIndex = CHROMATIC_NOTES.indexOf(parsed.note)
        if (noteIndex !== -1) {
          const nextNoteIndex = noteIndex + diff
          if (nextNoteIndex >= 0 && nextNoteIndex < CHROMATIC_NOTES.length) {
            const nextNote = CHROMATIC_NOTES[nextNoteIndex]
            const nextKey = parsed.scale ? `${nextNote} ${parsed.scale}` : nextNote
            setToneData((current) => ({ ...current, tone: nextKey }))
            await sendKeyScaleToCubase('pitch_shift', nextKey)
          }
        }
      }
    }
  }

  async function updateReturnSpeed(value: number) {
    const nextValue = clampMidiValue(value)
    setReturnSpeed(nextValue)
    await sendMidi('return_speed', cc.returnSpeed, nextValue)
  }

  async function refreshMidiPorts() {
    const [outputs, inputs] = await Promise.all([
      nhacApp.engineRequest('list_midi_outputs'),
      nhacApp.engineRequest('list_midi_inputs'),
    ])
    setMidiOutputs(outputs.ports || [])
    setMidiInputs(inputs.ports || [])
    setMidiSettings((current) => ({
      output: current.output || outputs.ports?.[0] || '',
      feedbackInput: current.feedbackInput || inputs.ports?.[0] || '',
    }))
  }

  async function startMidiFeedback(inputName = midiSettings.feedbackInput) {
    if (!inputName) return
    await saveConfig(configSettings, { ...midiSettings, feedbackInput: inputName })
    await nhacApp.engineRequest('start_midi_feedback', { midi_input_name: inputName })
  }

  async function startToneDetection() {
    const saved = await saveConfig()
    await nhacApp.engineRequest('configure', { midi_output_name: saved.midiOutputName })
    await nhacApp.engineRequest('start_analyzer', { reset_statistics: true })
    setToneData({ tone: '--', confidence: 0, isDetecting: true })
    setIsLive(true)
    lastAutoSentKey.current = ''
    setPitchShift(0)
    await sendMidi('tang_tong', cc.pitchShift, pitchDisplayToCc(0))
  }

  async function stopToneDetection() {
    await nhacApp.engineRequest('stop_analyzer')
    setToneData({ tone: '--', confidence: 0, isDetecting: false })
    setIsLive(false)
  }

  function getKeyScaleCcValues(keyName: string) {
    const match = keyName.trim().match(/^([A-G](?:#|b)?)\s*(.*)$/i)
    if (!match) throw new Error(`Tone không hợp lệ: ${keyName}`)
    const note = match[1].replace(/^([a-g])/, (letter) => letter.toUpperCase())
    const scale = (match[2] || 'major').trim().toLowerCase()
    const keyValue = KEY_TO_INDEX[note]
    if (keyValue === undefined) throw new Error(`Note không hỗ trợ: ${note}`)
    return { keyValue, scaleValue: SCALE_VALUE_BY_NAME[scale] ?? SCALE_VALUE_BY_NAME.major }
  }

  async function sendKeyScaleToCubase(reason = 'manual', keyName = toneData.tone) {
    if (!keyName || keyName === '--') return
    const values = getKeyScaleCcValues(keyName)
    const saved = await saveConfig()
    await nhacApp.engineRequest('set_cubase_cc', {
      channel: 0,
      control: 17,
      value: values.keyValue,
      midi_output_name: saved.midiOutputName || midiSettings.output,
    })
    await nhacApp.engineRequest('set_cubase_cc', {
      channel: 0,
      control: 18,
      value: values.scaleValue,
      midi_output_name: saved.midiOutputName || midiSettings.output,
    })
    console.log(`${reason} sent ${keyName}`)
  }

  async function autoSendDetectedKey(keyName: string, event: EngineEvent) {
    if (!autoSendKeyRef.current || !keyName || keyName === '--') return
    if (!event.midi_should_send) return
    if ((event.key_votes || 0) < (event.min_key_votes || 0)) return
    if (lastAutoSentKey.current === keyName) return
    lastAutoSentKey.current = keyName
    await sendKeyScaleToCubase('auto', keyName)
  }

  function applyMidiFeedback(control: number, value: number) {
    const nextValue = clampMidiValue(value)
    const isActive = value >= 64
    if (control === cc.controls.beat) setControls((current) => ({ ...current, beat: isActive }))
    if (control === cc.controls.mic) setControls((current) => ({ ...current, mic: isActive }))
    if (control === cc.controls.vang) setControls((current) => ({ ...current, vang: isActive }))
    if (control === cc.effects.tune) setEffects((current) => ({ ...current, tune: isActive }))
    if (control === cc.effects.lofi) setEffects((current) => ({ ...current, lofi: isActive }))
    if (control === cc.effects.remix) setEffects((current) => ({ ...current, remix: isActive }))
    if (control === cc.volumes.beat) setVolumes((current) => ({ ...current, beat: nextValue }))
    if (control === cc.volumes.mic) setVolumes((current) => ({ ...current, mic: nextValue }))
    if (control === cc.volumes.vang) setVolumes((current) => ({ ...current, vang: nextValue }))
    if (control === cc.volumes.vangNgan) setVolumes((current) => ({ ...current, vangNgan: nextValue }))
    if (control === cc.volumes.delay) setVolumes((current) => ({ ...current, delay: nextValue }))
    if (control === cc.pitchShift) setPitchShift(pitchCcToDisplay(nextValue))
  }

  async function chooseCubasePath() {
    const filePath = await nhacApp.selectCubase()
    if (filePath) {
      setSaveStatus('')
      setConfigSettings((current) => ({ ...current, cubasePath: filePath }))
    }
  }

  async function exportPreset() {
    await nhacApp.exportPreset({
      name: `TC Studio preset ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
      version: 1,
      controls: { ...controls, ...volumes, ...effects, pitchShift, returnSpeed },
    })
  }

  async function importPreset() {
    await nhacApp.importPreset()
  }

  return (
    <div className="bg-transparent flex items-center justify-center p-0">
      <div className="w-fit">
        <div ref={toolbarRef} className="drag-region bg-card rounded-2xl border border-border p-2.5 shadow-xl">
          <div className="flex items-center justify-center gap-1.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <div
                  className={`w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-black shadow-lg transition-shadow duration-500 ${isLive ? 'logo-spinning-wrapper' : ''}`}
                  style={{ boxShadow: isLive ? '0 0 10px 2px rgba(180,140,60,0.55)' : '0 0 8px 1px rgba(180,140,60,0.35)' }}
                >
                  <img
                    src={logo}
                    alt="TC Studio"
                    className={`w-full h-full object-cover ${isLive ? 'logo-spinning' : ''}`}
                  />
                </div>
                {isLive && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
              </div>
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="bg-background rounded-lg px-2 py-1 border border-border min-w-[52px] text-center">
                <p className="text-[8px] text-muted-foreground uppercase">Tone</p>
                {toneData.isDetecting && toneData.tone === '--' ? (
                  <p className="text-[9px] font-medium text-primary animate-pulse leading-tight whitespace-nowrap">Đang dò...</p>
                ) : (
                  <p className="text-sm font-bold font-mono text-foreground leading-tight">{toneData.tone}</p>
                )}
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={startToneDetection}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium transition-all ${
                    toneData.isDetecting ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                  }`}
                  title="Dò lại tone bài hát"
                >
                  <Play className="w-3 h-3" />
                  <span>Dò lại</span>
                </button>
                <button
                  onClick={stopToneDetection}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium transition-all bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  title="Dừng dò tone"
                >
                  <Square className="w-3 h-3" />
                  <span>Dừng</span>
                </button>
                <button
                  onClick={() => sendKeyScaleToCubase()}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"
                  title="Gửi key/scale sang Cubase"
                >
                  <Send className="w-3 h-3" />
                  <span>Gửi</span>
                </button>
              </div>
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1 shrink-0">
              <ToggleBtn label="Nhạc" active={controls.beat} onClick={() => toggleControl('beat')} />
              <ToggleBtn label="Mic" active={controls.mic} onClick={() => toggleControl('mic')} />
              <ToggleBtn label="Vang" active={controls.vang} onClick={() => toggleControl('vang')} />
              <PitchShiftControl value={pitchShift} onChange={updatePitchShift} tone={toneData.tone} />
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-0.5 shrink-0 no-drag">
              <button
                onClick={() => setAlwaysOnTop(v => !v)}
                className={`p-1 rounded-md transition-all ${alwaysOnTop ? 'text-amber-400 bg-amber-400/15 hover:bg-amber-400/25' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                title={alwaysOnTop ? 'Đang ưu tiên hiển thị — bấm để tắt' : 'Ưu tiên hiển thị trên cùng'}
              >
                {alwaysOnTop ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
              </button>
              <button
                onClick={() => nhacApp.minimizeWindow?.()}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="Thu nhỏ"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={() => nhacApp.quitApp?.()}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                title="Đóng ứng dụng"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-border">
            <div className="flex items-center gap-0.5 shrink-0">
              <VolumeControl value={volumes.beat} onChange={(value) => updateVolume('beat', value)} icon={<Music className="w-3.5 h-3.5" />} label="Nhạc" description="Âm lượng beat/nhạc nền" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.mic} onChange={(value) => updateVolume('mic', value)} icon={<Mic className="w-3.5 h-3.5" />} label="Mic" description="Âm lượng micro hát" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.vang} onChange={(value) => updateVolume('vang', value)} icon={<Waves className="w-3.5 h-3.5" />} label="Vang" description="Âm lượng tiếng vang chính" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.vangNgan} onChange={(value) => updateVolume('vangNgan', value)} icon={<Volume2 className="w-3.5 h-3.5" />} label="Vang ngắn" description="Âm lượng vang ngắn/phụ" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.delay} onChange={(value) => updateVolume('delay', value)} icon={<Clock className="w-3.5 h-3.5" />} label="Delay" description="Âm lượng tiếng lặp/delay" onPopupChange={handleVolumePopupChange} />
              <ParameterControl value={returnSpeed} onChange={updateReturnSpeed} icon={<Gauge className="w-3.5 h-3.5" />} label="Tốc độ tune" description="Chỉnh Return Speed của Auto-Tune" onPopupChange={handleVolumePopupChange} />
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1 shrink-0">
              <EffectBtn label="Tune" active={effects.tune} onClick={() => toggleEffect('tune')} icon={<Music className="w-2.5 h-2.5" />} />
              <EffectBtn label="Lofi" active={effects.lofi} onClick={() => toggleEffect('lofi')} icon={<Radio className="w-2.5 h-2.5" />} />
              <EffectBtn label="Remix" active={effects.remix} onClick={() => toggleEffect('remix')} icon={<Sparkles className="w-2.5 h-2.5" />} />
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
            <span className="text-[10px] text-muted-foreground">© TC Studio. All rights reserved.</span>
            <div className="flex items-center gap-1 no-drag">
              <div className="relative">
                <button
                  onClick={() => nhacApp.openSettingsWindow ? nhacApp.openSettingsWindow() : setShowSettings(!showSettings)}
                  className="p-1 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Cài đặt"
                >
                  <Settings className="w-3 h-3" />
                </button>

                <div
                  className={`absolute bottom-full right-0 mb-2 transition-all duration-200 z-50 ${
                    showSettings ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2'
                  }`}
                >
                  <div className="bg-card border border-border rounded-lg p-2 shadow-xl shadow-black/20 w-[280px]">
                    <div className="flex gap-1 mb-2">
                      <button
                        onClick={() => setSettingsTab('midi')}
                        className={`px-2 py-1 rounded-md text-[9px] font-medium transition-all ${
                          settingsTab === 'midi' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        MIDI
                      </button>
                      <button
                        onClick={() => setSettingsTab('config')}
                        className={`px-2 py-1 rounded-md text-[9px] font-medium transition-all ${
                          settingsTab === 'config' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        Cấu hình
                      </button>
                    </div>

                    {settingsTab === 'midi' ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground uppercase">MIDI</span>
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-medium truncate max-w-[150px]">
                            FB: {midiSettings.feedbackInput || '--'}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] text-muted-foreground uppercase">MIDI gửi sang Cubase</label>
                          <div className="relative">
                            <select
                              value={midiSettings.output}
                              onChange={(event) => {
                                const next = { ...midiSettings, output: event.target.value }
                                setSaveStatus('')
                                setMidiSettings(next)
                              }}
                              className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px] text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
                            >
                              {(midiOutputs.length ? midiOutputs : [midiSettings.output || '']).map((port) => (
                                <option key={port} value={port}>
                                  {port || 'Chưa chọn MIDI output'}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] text-muted-foreground uppercase">MIDI nhận từ Cubase</label>
                          <div className="relative">
                            <select
                              value={midiSettings.feedbackInput}
                              onChange={(event) => {
                                const next = { ...midiSettings, feedbackInput: event.target.value }
                                setSaveStatus('')
                                setMidiSettings(next)
                              }}
                              className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px] text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/50"
                            >
                              {(midiInputs.length ? midiInputs : [midiSettings.feedbackInput || '']).map((port) => (
                                <option key={port} value={port}>
                                  {port || 'Chưa chọn MIDI input'}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 pt-1">
                          <button onClick={refreshMidiPorts} className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[9px] font-medium transition-all">
                            <RefreshCw className="w-2.5 h-2.5" />
                            Làm mới
                          </button>
                          <button onClick={() => sendMidi('Test MIDI', 23, 127)} className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[9px] font-medium transition-all">
                            Test MIDI
                          </button>
                          <button onClick={exportPreset} className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[9px] font-medium transition-all">
                            Lưu
                          </button>
                          <button onClick={importPreset} className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[9px] font-medium transition-all">
                            Nhập
                          </button>
                        </div>
                        <button onClick={() => saveConfig(configSettings, midiSettings, autoSendKey, true)} className="w-full mt-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[9px] font-medium hover:bg-primary/90 transition-all">
                          {saveStatus || 'Lưu cài đặt'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground uppercase">Cấu hình</span>
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[8px] font-medium">Windows</span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] text-muted-foreground uppercase">Cubase</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={configSettings.cubasePath}
                              onChange={(event) => {
                                setSaveStatus('')
                                setConfigSettings((current) => ({ ...current, cubasePath: event.target.value }))
                              }}
                              className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                            <button onClick={chooseCubasePath} className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-all">
                              <FolderOpen className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={configSettings.autoOpenYoutube}
                              onChange={(event) => {
                                saveConfigField('autoOpenYoutube', event.target.checked)
                              }}
                              className="accent-primary"
                            />
                            <span className="text-[9px] text-foreground">Tự mở YouTube khi bật app</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={configSettings.autoOpenCubase}
                              onChange={(event) => {
                                saveConfigField('autoOpenCubase', event.target.checked)
                              }}
                              className="accent-primary"
                            />
                            <span className="text-[9px] text-foreground">Tự mở Cubase chạy nền khi bật app</span>
                          </label>
                        </div>

                        <button onClick={() => saveConfig(configSettings, midiSettings, autoSendKey, true)} className="w-full mt-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[9px] font-medium hover:bg-primary/90 transition-all">
                          {saveStatus || 'Lưu cài đặt'}
                        </button>
                        <p className="text-[8px] text-muted-foreground text-center">
                          Tắt YouTube ở đây sẽ áp dụng cho lần mở app tiếp theo.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45 absolute right-3 -bottom-1" />
                </div>
              </div>
              <button onClick={() => nhacApp.launchYoutube(configSettings.youtubeUrl)} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[9px] font-medium hover:bg-primary/90 transition-all">
                <ExternalLink className="w-2.5 h-2.5" />
                <span>YouTube</span>
              </button>
              <button
                onClick={() => nhacApp.openLaughWindow?.()}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[9px] font-medium hover:bg-muted/80 hover:text-foreground transition-all"
                title="Mở bảng tiếng cười"
              >
                <Smile className="w-2.5 h-2.5" />
                <span>Cười</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
