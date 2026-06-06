import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
}

type VolumeControlProps = {
  value: number
  onChange: (value: number) => void
  icon: React.ReactNode
  label: string
  max?: number
  onPopupChange?: (isOpen: boolean) => void
}

function formatCubaseDb(value: number, max = 127) {
  if (value <= 0) return '-inf dB'

  const normalized = Math.min(value / max, 1)
  const gain = normalized * 2
  const db = Math.min(20 * Math.log10(gain), 6.02)

  if (db > -0.005 && db < 0.005) return '0.00 dB'
  return `${db > 0 ? '+' : ''}${db.toFixed(2)} dB`
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

function VolumeControl({ value, onChange, icon, label, max = 127, onPopupChange }: VolumeControlProps) {
  const [isOpen, setIsOpen] = useState(false)
  const percentage = (value / max) * 100
  const cubaseDb = formatCubaseDb(value, max)

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
        title={label}
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
            <span className="text-[10px] font-mono text-primary">{cubaseDb}</span>
          </div>
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
}: {
  value: number
  onChange: (value: number) => void
}) {
  const canDecrease = value > PITCH_DISPLAY_MIN
  const canIncrease = value < PITCH_DISPLAY_MAX

  return (
    <div className="no-drag flex items-center gap-0.5 rounded-md bg-background border border-border px-1 py-0.5">
      <button
        onClick={() => canDecrease && onChange(value - 1)}
        disabled={!canDecrease}
        className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        title="Giảm tông"
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
        title="Tăng tông"
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
      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 ${
        active ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      {label}
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
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 border ${
        active ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50'
      }`}
    >
      {icon}
      {label}
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
  const [autoSendKey, setAutoSendKey] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'midi' | 'config'>('midi')
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
    }),
    [],
  )

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString('vi-VN', { hour12: true }))
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    autoSendKeyRef.current = autoSendKey
  }, [autoSendKey])

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
    nhacApp.getConfig().then((config) => {
      setAutoSendKey(Boolean(config.autoSendKey))
      const feedbackInput = config.midiInputName || ''
      setMidiSettings({
        output: config.midiOutputName || '',
        feedbackInput,
      })
      setConfigSettings({
        youtubeUrl: config.youtubeUrl || 'https://www.youtube.com',
        pythonPath: config.pythonPath || 'python',
        cubasePath: config.cubasePath || '',
        autoOpenYoutube: Boolean(config.autoLaunchYoutube),
        autoOpenCubase: Boolean(config.autoLaunchCubase),
      })
      if (config.midiOutputName) setMidiOutputs([config.midiOutputName])
      if (feedbackInput) {
        setMidiInputs([feedbackInput])
        nhacApp.engineRequest('start_midi_feedback', { midi_input_name: feedbackInput }).catch(console.error)
      }
    })

    nhacApp.onEngineEvent((event) => {
      if (event.type === 'tone') {
        const confidence = Math.round((event.confidence || 0) * 100)
        const nextTone = event.key || '--'
        setToneData({ tone: nextTone, confidence, isDetecting: true })
        setAnalysis({
          latency: event.analysis_ms === undefined ? '--' : String(event.analysis_ms),
          window: event.key_votes === undefined ? '--' : `${event.key_votes}/${event.min_key_votes ?? '--'}`,
          instant: event.instant_key || '--',
        })
        autoSendDetectedKey(nextTone, event).catch(console.error)
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
  }, [nhacApp])

  async function saveConfig(next = configSettings, midi = midiSettings, auto = autoSendKey) {
    return nhacApp.saveConfig({
      youtubeUrl: next.youtubeUrl,
      pythonPath: next.pythonPath,
      cubasePath: next.cubasePath,
      autoLaunchYoutube: next.autoOpenYoutube,
      autoLaunchCubase: next.autoOpenCubase,
      midiOutputName: midi.output,
      midiInputName: midi.feedbackInput,
      autoSendKey: auto,
    })
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
    setPitchShift(nextValue)
    await sendMidi('tang_tong', cc.pitchShift, pitchDisplayToCc(nextValue))
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
    if (filePath) setConfigSettings((current) => ({ ...current, cubasePath: filePath }))
  }

  async function exportPreset() {
    await nhacApp.exportPreset({
      name: `ToneLink preset ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
      version: 1,
      controls: { ...controls, ...volumes, ...effects, pitchShift },
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
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Disc3 className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                {isLive && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
              </div>
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="bg-background rounded-lg px-2 py-1 border border-border min-w-[45px] text-center">
                <p className="text-[8px] text-muted-foreground uppercase">Tone</p>
                <p className="text-sm font-bold font-mono text-foreground leading-tight">{toneData.tone}</p>
              </div>
              <div className="bg-background rounded-lg px-2 py-1 border border-border min-w-[40px] text-center">
                <p className="text-[8px] text-muted-foreground uppercase">Conf</p>
                <p className="text-sm font-bold font-mono text-primary leading-tight">{toneData.confidence}%</p>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={startToneDetection}
                  className={`p-1 rounded-md transition-all ${
                    toneData.isDetecting ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground'
                  }`}
                  title="Start Detection"
                >
                  <Play className="w-3 h-3" />
                </button>
                <button
                  onClick={stopToneDetection}
                  className="p-1 rounded-md bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-all"
                  title="Stop"
                >
                  <Square className="w-3 h-3" />
                </button>
                <button
                  onClick={() => sendKeyScaleToCubase()}
                  className="p-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
                  title="Send Key/Scale"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1 shrink-0">
              <ToggleBtn label="Beat" active={controls.beat} onClick={() => toggleControl('beat')} />
              <ToggleBtn label="Mic" active={controls.mic} onClick={() => toggleControl('mic')} />
              <ToggleBtn label="Vang" active={controls.vang} onClick={() => toggleControl('vang')} />
              <PitchShiftControl value={pitchShift} onChange={updatePitchShift} />
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsLive(!isLive)}
                className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase transition-all ${
                  isLive ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-muted text-muted-foreground'
                }`}
              >
                {isLive ? 'Live' : 'Off'}
              </button>

              <div className="relative">
                <button
                  onClick={() => nhacApp.openSettingsWindow ? nhacApp.openSettingsWindow() : setShowSettings(!showSettings)}
                  className="p-1 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Settings"
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
                          <label className="text-[8px] text-muted-foreground uppercase">Output</label>
                          <div className="relative">
                            <select
                              value={midiSettings.output}
                              onChange={(event) => {
                                const next = { ...midiSettings, output: event.target.value }
                                setMidiSettings(next)
                                saveConfig(configSettings, next)
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
                          <label className="text-[8px] text-muted-foreground uppercase">Feedback Input</label>
                          <div className="relative">
                            <select
                              value={midiSettings.feedbackInput}
                              onChange={(event) => {
                                const next = { ...midiSettings, feedbackInput: event.target.value }
                                setMidiSettings(next)
                                startMidiFeedback(event.target.value)
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
                            Test CC23
                          </button>
                          <button onClick={exportPreset} className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[9px] font-medium transition-all">
                            Lưu
                          </button>
                          <button onClick={importPreset} className="px-1.5 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[9px] font-medium transition-all">
                            Nhập
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-muted-foreground uppercase">Cấu hình</span>
                          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[8px] font-medium">Windows</span>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] text-muted-foreground uppercase">YouTube URL</label>
                          <input
                            type="text"
                            value={configSettings.youtubeUrl}
                            onChange={(event) => setConfigSettings((current) => ({ ...current, youtubeUrl: event.target.value }))}
                            className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] text-muted-foreground uppercase">Python</label>
                          <input
                            type="text"
                            value={configSettings.pythonPath}
                            onChange={(event) => setConfigSettings((current) => ({ ...current, pythonPath: event.target.value }))}
                            className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] text-muted-foreground uppercase">Cubase</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={configSettings.cubasePath}
                              onChange={(event) => setConfigSettings((current) => ({ ...current, cubasePath: event.target.value }))}
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
                              onChange={() => setConfigSettings((current) => ({ ...current, autoOpenYoutube: !current.autoOpenYoutube }))}
                              className="accent-primary"
                            />
                            <span className="text-[9px] text-foreground">Tự mở YouTube khi bật app</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={configSettings.autoOpenCubase}
                              onChange={() => setConfigSettings((current) => ({ ...current, autoOpenCubase: !current.autoOpenCubase }))}
                              className="accent-primary"
                            />
                            <span className="text-[9px] text-foreground">Tự mở Cubase chạy nền khi bật app</span>
                          </label>
                        </div>

                        <button onClick={() => saveConfig()} className="w-full mt-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[9px] font-medium hover:bg-primary/90 transition-all">
                          Lưu cấu hình
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45 absolute right-3 -bottom-1" />
                </div>
              </div>
              <button onClick={() => nhacApp.launchCubase(configSettings.cubasePath)} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[9px] font-medium hover:bg-primary/90 transition-all">
                <ExternalLink className="w-2.5 h-2.5" />
                <span>Cubase</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 mt-2 pt-2 border-t border-border">
            <div className="flex items-center gap-0.5 shrink-0">
              <VolumeControl value={volumes.beat} onChange={(value) => updateVolume('beat', value)} icon={<Music className="w-3.5 h-3.5" />} label="Beat" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.mic} onChange={(value) => updateVolume('mic', value)} icon={<Mic className="w-3.5 h-3.5" />} label="Mic" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.vang} onChange={(value) => updateVolume('vang', value)} icon={<Waves className="w-3.5 h-3.5" />} label="Vang" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.vangNgan} onChange={(value) => updateVolume('vangNgan', value)} icon={<Volume2 className="w-3.5 h-3.5" />} label="Vang Ngan" onPopupChange={handleVolumePopupChange} />
              <VolumeControl value={volumes.delay} onChange={(value) => updateVolume('delay', value)} icon={<Timer className="w-3.5 h-3.5" />} label="Delay" onPopupChange={handleVolumePopupChange} />
            </div>

            <div className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1 shrink-0">
              <EffectBtn label="Tune" active={effects.tune} onClick={() => toggleEffect('tune')} icon={<Music className="w-2.5 h-2.5" />} />
              <EffectBtn label="Lofi" active={effects.lofi} onClick={() => toggleEffect('lofi')} icon={<Radio className="w-2.5 h-2.5" />} />
              <EffectBtn label="Remix" active={effects.remix} onClick={() => toggleEffect('remix')} icon={<Sparkles className="w-2.5 h-2.5" />} />
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground font-mono">
            <div className="flex items-center gap-3">
              <span>Analysis: {analysis.latency} ms</span>
              <span>Window: {analysis.window}</span>
              <span>Instant: {analysis.instant}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${autoSendKey ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                  {autoSendKey && (
                    <svg className="w-2 h-2 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <span>Auto Key/Scale</span>
                <input
                  type="checkbox"
                  checked={autoSendKey}
                  onChange={(event) => {
                    setAutoSendKey(event.target.checked)
                    saveConfig(configSettings, midiSettings, event.target.checked)
                  }}
                  className="sr-only"
                />
              </label>
              <span>UI: {currentTime}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
