import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Minus, Plus, RefreshCw, Smile, Square, Trash2, Volume2, X } from 'lucide-react'

// ─── Fallback ────────────────────────────────────────────────────────────────
const fallbackNhacApp: Window['nhacApp'] = {
  getConfig: async () => ({}),
  saveConfig: async (c) => c,
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
  minimizeWindow: async () => false,
  minimizeCurrentWindow: async () => false,
  quitApp: async () => false,
  selectAudioFile: async () => null,
  readAudioFile: async () => ({ ok: false, error: 'fallback' }),
  engineRequest: async (cmd) => {
    if (cmd === 'list_midi_outputs' || cmd === 'list_midi_inputs') return { ports: [] }
    return {}
  },
  stopEngineProcess: async () => false,
  onYoutubeVideoSelected: () => {},
  onYoutubePlaybackState: () => {},
  onEngineEvent: () => {},
  onEngineLog: () => {},
  onConfigChanged: () => {},
}

// ─── Synthetic sound presets ──────────────────────────────────────────────────
const SYNTH_PRESETS = [
  { pitch: 520, speed: 1.0,  bursts: 5, tone: 'bright' as const },
  { pitch: 760, speed: 1.35, bursts: 7, tone: 'small'  as const },
  { pitch: 620, speed: 1.55, bursts: 9, tone: 'wild'   as const },
  { pitch: 390, speed: 0.85, bursts: 5, tone: 'deep'   as const },
  { pitch: 500, speed: 1.2,  bursts: 4, tone: 'bright' as const },
  { pitch: 460, speed: 0.9,  bursts: 3, tone: 'deep'   as const },
  { pitch: 340, speed: 0.8,  bursts: 4, tone: 'deep'   as const },
  { pitch: 900, speed: 1.4,  bursts: 6, tone: 'bright' as const },
  { pitch: 680, speed: 1.1,  bursts: 5, tone: 'bright' as const },
  { pitch: 580, speed: 1.25, bursts: 6, tone: 'wild'   as const },
  { pitch: 430, speed: 0.75, bursts: 3, tone: 'deep'   as const },
  { pitch: 650, speed: 1.45, bursts: 8, tone: 'wild'   as const },
  { pitch: 540, speed: 1.0,  bursts: 5, tone: 'bright' as const },
  { pitch: 720, speed: 1.2,  bursts: 6, tone: 'small'  as const },
  { pitch: 400, speed: 0.9,  bursts: 4, tone: 'deep'   as const },
  { pitch: 600, speed: 1.3,  bursts: 7, tone: 'wild'   as const },
]

const DEFAULT_SLOT_NAMES = [
  'Cười 1', 'Con nít', 'Điên', 'To', 'Hà hê', 'Trời ơi',
  'Đàn ông', 'Vỗ tay', 'Win PK', 'Funny', 'Gây cấn', 'PK hype',
  'Slot 13', 'Slot 14', 'Slot 15', 'Slot 16',
]

// ─── Types ───────────────────────────────────────────────────────────────────
type SoundSlot = { id: string; label: string; filePath?: string }
type SoundTab  = { id: string; name: string; slots: SoundSlot[] }

const SLOTS_PER_TAB = 16

function makeSlots(tabId: string): SoundSlot[] {
  return Array.from({ length: SLOTS_PER_TAB }, (_, i) => ({
    id: `${tabId}-s${i}`,
    label: DEFAULT_SLOT_NAMES[i] ?? `Slot ${i + 1}`,
  }))
}

function makeTab(name: string): SoundTab {
  const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  return { id, name, slots: makeSlots(id) }
}

function loadTabs(): SoundTab[] {
  try {
    const saved = localStorage.getItem('laugh-tabs')
    if (saved) return JSON.parse(saved) as SoundTab[]
  } catch { /**/ }
  return [makeTab('Tab 1')]
}

// ─── Synthetic audio ─────────────────────────────────────────────────────────
function createNoiseBuffer(ctx: AudioContext, dur: number) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function playSynth(
  ctx: AudioContext,
  synthIdx: number,
  vol: number,
  onDone: () => void,
) {
  const preset = SYNTH_PRESETS[synthIdx % SYNTH_PRESETS.length]
  const { pitch, speed, bursts, tone } = preset
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(Math.max(0, Math.min(vol, 1)), now)
  master.connect(ctx.destination)

  const burstDur = 0.095 / speed
  const gap      = 0.075 / speed
  const fBase    = tone === 'deep' ? 720 : tone === 'small' ? 1800 : 1250

  for (let i = 0; i < bursts; i++) {
    const t = now + i * (burstDur + gap)
    const osc    = ctx.createOscillator()
    const noise  = ctx.createBufferSource()
    const filt   = ctx.createBiquadFilter()
    const tGain  = ctx.createGain()
    const nGain  = ctx.createGain()
    const wiggle = tone === 'wild' ? Math.sin(i * 1.7) * 90 : Math.sin(i) * 36

    osc.type = tone === 'deep' ? 'sawtooth' : 'square'
    osc.frequency.setValueAtTime(pitch + wiggle, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, pitch * 0.72 + wiggle), t + burstDur)
    filt.type = 'bandpass'
    filt.frequency.setValueAtTime(fBase + i * 70, t)
    filt.Q.setValueAtTime(tone === 'small' ? 9 : 5, t)

    noise.buffer = createNoiseBuffer(ctx, burstDur)
    noise.connect(filt); filt.connect(nGain)
    osc.connect(tGain)
    tGain.connect(master); nGain.connect(master)

    const tLvl = tone === 'deep' ? 0.18 : 0.11
    const nLvl = tone === 'small' ? 0.035 : 0.06

    tGain.gain.setValueAtTime(0.0001, t)
    tGain.gain.exponentialRampToValueAtTime(tLvl, t + 0.015)
    tGain.gain.exponentialRampToValueAtTime(0.0001, t + burstDur)
    nGain.gain.setValueAtTime(0.0001, t)
    nGain.gain.exponentialRampToValueAtTime(nLvl, t + 0.01)
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + burstDur)

    osc.start(t); osc.stop(t + burstDur)
    noise.start(t); noise.stop(t + burstDur)
  }

  const endT = now + bursts * (burstDur + gap) + 0.08
  master.gain.exponentialRampToValueAtTime(0.0001, endT)
  const tid = window.setTimeout(() => { master.disconnect(); onDone() }, Math.ceil((endT - now) * 1000) + 80)
  return {
    stop() {
      window.clearTimeout(tid)
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.015)
      window.setTimeout(() => { master.disconnect(); onDone() }, 80)
    },
  }
}

function basename(p: string) { return p.replace(/\\/g, '/').split('/').pop() ?? p }

// ─── Component ───────────────────────────────────────────────────────────────
export default function LaughWindow() {
  const nhacApp = useMemo(() => window.nhacApp ?? fallbackNhacApp, [])

  // Audio refs
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const activeSynthRef = useRef<{ stop(): void } | null>(null)
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const loopTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tab state
  const [tabs,        setTabs]        = useState<SoundTab[]>(loadTabs)
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const saved = localStorage.getItem('laugh-active-tab')
    const t = loadTabs()
    return (saved && t.find(x => x.id === saved)) ? saved : t[0].id
  })
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)

  // Playback state
  const [activeSlotId, setActiveSlotId] = useState('')
  const [status,       setStatus]       = useState('Sẵn sàng — phím 1–9 phát nhanh')
  const [volume,       setVolume]       = useState(() => Number(localStorage.getItem('laugh-vol') ?? '70'))
  const [loop,         setLoop]         = useState(false)
  const loopRef     = useRef(loop); loopRef.current = loop
  const loopSlotRef = useRef<{ tabId: string; slot: SoundSlot; synthIdx: number } | null>(null)

  // Edit mode
  const [editMode, setEditMode] = useState(false)

  // Persist tabs & active tab
  useEffect(() => { localStorage.setItem('laugh-tabs', JSON.stringify(tabs)) }, [tabs])
  useEffect(() => { localStorage.setItem('laugh-active-tab', activeTabId) }, [activeTabId])
  useEffect(() => { localStorage.setItem('laugh-vol', String(volume)) }, [volume])

  // Cleanup on unmount
  useEffect(() => () => {
    activeSynthRef.current?.stop()
    activeAudioRef.current?.pause()
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
    audioCtxRef.current?.close().catch(() => {})
  }, [])

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0]

  // ─ Audio context ─
  async function getCtx() {
    const Cls = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!audioCtxRef.current) audioCtxRef.current = new Cls()
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  // ─ Stop ─
  const stopLaugh = useCallback(() => {
    activeSynthRef.current?.stop(); activeSynthRef.current = null
    if (activeAudioRef.current) {
      activeAudioRef.current.pause()
      activeAudioRef.current.currentTime = 0
      activeAudioRef.current = null
    }
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null }
    loopSlotRef.current = null
    setActiveSlotId(''); setStatus('Đã dừng')
  }, [])

  // ─ Play ─
  const playSlot = useCallback(async (
    slot: SoundSlot,
    synthIdx: number,
    tabId: string,
    isLooping = false,
  ) => {
    // Stop previous
    activeSynthRef.current?.stop(); activeSynthRef.current = null
    if (activeAudioRef.current) {
      activeAudioRef.current.pause(); activeAudioRef.current.currentTime = 0; activeAudioRef.current = null
    }
    if (loopTimerRef.current) { clearTimeout(loopTimerRef.current); loopTimerRef.current = null }

    setActiveSlotId(slot.id)
    loopSlotRef.current = isLooping ? { tabId, slot, synthIdx } : null

    const replay = () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
      loopTimerRef.current = setTimeout(() => playSlot(slot, synthIdx, tabId, true), 180)
    }
    const onEnd = () => {
      if (loopRef.current && loopSlotRef.current?.slot.id === slot.id) replay()
      else setActiveSlotId(cur => cur === slot.id ? '' : cur)
    }

    if (slot.filePath) {
      setStatus(`⏳ Đang tải: ${basename(slot.filePath)}...`)
      const res = await nhacApp.readAudioFile(slot.filePath)
      if (!res.ok || !res.base64) {
        setStatus(`⚠ Không đọc được file`); setActiveSlotId(''); return
      }
      const ext = slot.filePath.split('.').pop()?.toLowerCase() ?? 'mp3'
      const mime: Record<string, string> = {
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
        m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm',
      }
      const bytes  = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0))
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime[ext] ?? 'audio/mpeg' }))
      const audio   = new Audio(blobUrl)
      audio.volume  = Math.max(0, Math.min(volume / 100, 1))
      activeAudioRef.current = audio
      setStatus(isLooping ? `🔁 ${slot.label}` : `▶ ${slot.label}`)
      audio.onended = () => { URL.revokeObjectURL(blobUrl); if (activeAudioRef.current === audio) activeAudioRef.current = null; onEnd() }
      audio.onerror = () => { URL.revokeObjectURL(blobUrl); setStatus('⚠ Lỗi phát'); setActiveSlotId('') }
      await audio.play()
    } else {
      const ctx = await getCtx()
      const preset = SYNTH_PRESETS[synthIdx % SYNTH_PRESETS.length]
      const dur = Math.ceil((preset.bursts * (0.095 / preset.speed + 0.075 / preset.speed) + 0.16) * 1000)
      setStatus(isLooping ? `🔁 ${slot.label}` : `▶ ${slot.label}`)
      let current: { stop(): void } | null = null
      current = playSynth(ctx, synthIdx, volume / 100, () => {
        if (activeSynthRef.current === current) activeSynthRef.current = null
        onEnd()
      })
      activeSynthRef.current = current
      if (!isLooping) window.setTimeout(() => setActiveSlotId(cur => cur === slot.id ? '' : cur), dur)
    }
  }, [nhacApp, volume])

  // ─ Hotkeys ─
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1
        const slot = activeTab?.slots[idx]
        if (slot) playSlot(slot, idx, activeTab.id, loopRef.current)
      } else if (e.key === '0' || e.key === ' ') {
        stopLaugh()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab, playSlot, stopLaugh])

  // ─ Tab management ─
  function addTab() {
    const n = makeTab(`Tab ${tabs.length + 1}`)
    setTabs(prev => [...prev, n])
    setActiveTabId(n.id)
  }

  function deleteTab(tabId: string) {
    if (tabs.length <= 1) return
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId)
      if (activeTabId === tabId) setActiveTabId(next[0].id)
      return next
    })
  }

  function renameTab(tabId: string, name: string) {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, name: name.trim() || t.name } : t))
    setRenamingTabId(null)
  }

  // ─ Slot management ─
  function updateSlotLabel(tabId: string, slotId: string, label: string) {
    setTabs(prev => prev.map(t => t.id !== tabId ? t : {
      ...t, slots: t.slots.map(s => s.id !== slotId ? s : { ...s, label })
    }))
  }

  function updateSlotFile(tabId: string, slotId: string, filePath: string | undefined) {
    setTabs(prev => prev.map(t => t.id !== tabId ? t : {
      ...t, slots: t.slots.map(s => s.id !== slotId ? s : { ...s, filePath })
    }))
  }

  async function assignFile(tabId: string, slotId: string) {
    const path = await nhacApp.selectAudioFile?.()
    if (!path) return
    updateSlotFile(tabId, slotId, path)
    setStatus(`Đã gán: ${basename(path)}`)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col h-screen">

        {/* ── Titlebar ── */}
        <div className="drag-region flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 text-primary flex items-center justify-center">
              <Smile className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold">Bảng tiếng cười</span>
          </div>
          <div className="no-drag flex items-center gap-0.5">
            <button
              onClick={() => setEditMode(v => !v)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-all cursor-pointer ${editMode ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {editMode ? 'Xong' : 'Chỉnh sửa'}
            </button>
            <button onClick={() => nhacApp.minimizeCurrentWindow?.()} className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer" title="Thu nhỏ">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => nhacApp.closeCurrentWindow()} className="p-1 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all cursor-pointer" title="Đóng">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center border-b border-border bg-background/50 px-1 gap-0.5 shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <div key={tab.id} className={`relative flex items-center group shrink-0 ${activeTabId === tab.id ? 'border-b-2 border-primary' : ''}`}>
              {renamingTabId === tab.id ? (
                <input
                  autoFocus
                  defaultValue={tab.name}
                  onBlur={e => renameTab(tab.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameTab(tab.id, e.currentTarget.value); if (e.key === 'Escape') setRenamingTabId(null) }}
                  className="no-drag w-16 text-[10px] font-medium bg-background border border-primary/50 rounded px-1 py-0.5 focus:outline-none my-1"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <button
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={() => setRenamingTabId(tab.id)}
                  className={`no-drag px-2 py-1.5 text-[10px] font-medium transition-all cursor-pointer whitespace-nowrap ${activeTabId === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Bấm để chọn · Double-click để đổi tên"
                >
                  {tab.name}
                </button>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); deleteTab(tab.id) }}
                  className="no-drag opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all cursor-pointer mr-0.5"
                  title="Xóa tab"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            className="no-drag p-1 my-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer shrink-0"
            title="Thêm tab mới"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Grid 4×4 ── */}
        <div className="flex-1 p-1.5 overflow-hidden">
          {editMode && (
            <div className="mb-1.5 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[9px] text-primary">
              ✏️ Bấm vào <strong>tên</strong> để đổi · 📁 <strong>File</strong> để gán âm thanh · 🗑 xóa file · Double-click tab để đổi tên tab
            </div>
          )}
          <div className="grid grid-cols-4 gap-1">
            {(activeTab?.slots ?? []).map((slot, index) => {
              const isActive = activeSlotId === slot.id
              const hasFile  = !!slot.filePath
              return (
                <div key={slot.id} className="relative group">
                  <button
                    onClick={() => !editMode && playSlot(slot, index, activeTab.id, loop)}
                    className={`no-drag w-full min-h-[44px] rounded-lg border px-1 py-1 text-[9px] font-semibold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : hasFile
                          ? 'border-primary/40 bg-primary/5 text-foreground hover:border-primary/70 hover:bg-primary/10'
                          : 'border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted'
                    } ${editMode ? 'opacity-50 cursor-default' : ''}`}
                  >
                    {index < 9 && (
                      <span className={`absolute top-0.5 right-1 text-[7px] font-mono ${isActive ? 'text-primary-foreground/50' : 'text-muted-foreground/60'}`}>
                        {index + 1}
                      </span>
                    )}
                    <span className="truncate w-full text-center leading-tight">{slot.label}</span>
                    {hasFile && (
                      <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-primary-foreground/60' : 'bg-primary'}`} />
                    )}
                  </button>

                  {/* Edit overlay */}
                  {editMode && (
                    <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-1 bg-background/92 backdrop-blur-sm p-1">
                      <input
                        type="text"
                        defaultValue={slot.label}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          updateSlotLabel(activeTab.id, slot.id, v || slot.label)
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className="no-drag w-full text-center text-[8px] font-semibold bg-background border border-primary/40 rounded px-0.5 py-0.5 focus:outline-none focus:border-primary text-foreground"
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => assignFile(activeTab.id, slot.id)}
                          className="no-drag flex items-center gap-0.5 px-1 py-0.5 rounded bg-primary text-primary-foreground text-[8px] font-medium hover:bg-primary/90 cursor-pointer"
                        >
                          <FolderOpen className="w-2.5 h-2.5" />
                          <span>File</span>
                        </button>
                        {hasFile && (
                          <button
                            onClick={() => updateSlotFile(activeTab.id, slot.id, undefined)}
                            className="no-drag p-0.5 rounded bg-destructive/15 text-destructive hover:bg-destructive/25 cursor-pointer"
                            title="Xóa file"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="shrink-0 border-t border-border px-2 py-1.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] text-muted-foreground truncate flex-1">{status}</span>
            <div className="flex items-center gap-1 text-primary shrink-0">
              <Volume2 className="w-3 h-3" />
              <span className="text-[9px] font-mono w-6 text-right">{volume}%</span>
            </div>
          </div>
          <input
            type="range" min="0" max="100" value={volume}
            onChange={e => {
              const v = Number(e.target.value)
              setVolume(v)
              if (activeAudioRef.current) activeAudioRef.current.volume = v / 100
            }}
            className="no-drag w-full accent-primary cursor-pointer"
          />
          <div className="flex gap-1">
            <button
              onClick={() => setLoop(prev => { if (prev) { stopLaugh(); setStatus('Sẵn sàng') } return !prev })}
              className={`no-drag flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[9px] font-medium transition-all cursor-pointer ${
                loop ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              {loop ? 'Lặp: Bật' : 'Lặp: Tắt'}
            </button>
            <button
              onClick={stopLaugh}
              className="no-drag flex flex-1 items-center justify-center gap-1 rounded-md bg-muted px-2 py-1 text-[9px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Square className="w-3 h-3" />
              Dừng
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
