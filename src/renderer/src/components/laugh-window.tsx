import { useEffect, useMemo, useRef, useState } from 'react'
import { Smile, Square, Volume2, X } from 'lucide-react'

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
}

type LaughSound = {
  id: string
  label: string
  pitch: number
  speed: number
  bursts: number
  tone: 'bright' | 'deep' | 'small' | 'wild'
}

const LAUGH_SOUNDS: LaughSound[] = [
  { id: 'laugh-1', label: 'Cười 1', pitch: 520, speed: 1, bursts: 5, tone: 'bright' },
  { id: 'kid', label: 'Cười con nít', pitch: 760, speed: 1.35, bursts: 7, tone: 'small' },
  { id: 'crazy', label: 'Cười điên', pitch: 620, speed: 1.55, bursts: 9, tone: 'wild' },
  { id: 'big', label: 'Cười to', pitch: 390, speed: 0.85, bursts: 5, tone: 'deep' },
  { id: 'hehe', label: 'Hà hê', pitch: 500, speed: 1.2, bursts: 4, tone: 'bright' },
  { id: 'troi-oi', label: 'Trời ơi', pitch: 460, speed: 0.9, bursts: 3, tone: 'deep' },
  { id: 'man', label: 'Đàn ông cười', pitch: 340, speed: 0.8, bursts: 4, tone: 'deep' },
  { id: 'clap', label: 'Vỗ tay', pitch: 900, speed: 1.4, bursts: 6, tone: 'bright' },
  { id: 'win-pk', label: 'Win PK', pitch: 680, speed: 1.1, bursts: 5, tone: 'bright' },
  { id: 'funny', label: 'Funny', pitch: 580, speed: 1.25, bursts: 6, tone: 'wild' },
  { id: 'tension', label: 'Gây cấn', pitch: 430, speed: 0.75, bursts: 3, tone: 'deep' },
  { id: 'pk-hype', label: 'PK hào hứng', pitch: 650, speed: 1.45, bursts: 8, tone: 'wild' },
]

function createNoiseBuffer(context: AudioContext, duration: number) {
  const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate)
  const data = buffer.getChannelData(0)

  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = Math.random() * 2 - 1
  }

  return buffer
}

function playSyntheticLaugh(context: AudioContext, sound: LaughSound, volume: number, onDone: () => void) {
  const now = context.currentTime
  const master = context.createGain()
  master.gain.setValueAtTime(Math.max(0, Math.min(volume, 1)), now)
  master.connect(context.destination)

  const burstDuration = 0.095 / sound.speed
  const gap = 0.075 / sound.speed
  const filterBase = sound.tone === 'deep' ? 720 : sound.tone === 'small' ? 1800 : 1250

  for (let index = 0; index < sound.bursts; index += 1) {
    const start = now + index * (burstDuration + gap)
    const toneGain = context.createGain()
    const noiseGain = context.createGain()
    const oscillator = context.createOscillator()
    const noise = context.createBufferSource()
    const filter = context.createBiquadFilter()

    const wiggle = sound.tone === 'wild' ? Math.sin(index * 1.7) * 90 : Math.sin(index) * 36
    oscillator.type = sound.tone === 'deep' ? 'sawtooth' : 'square'
    oscillator.frequency.setValueAtTime(sound.pitch + wiggle, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, sound.pitch * 0.72 + wiggle), start + burstDuration)

    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(filterBase + index * 70, start)
    filter.Q.setValueAtTime(sound.tone === 'small' ? 9 : 5, start)

    noise.buffer = createNoiseBuffer(context, burstDuration)
    noise.connect(filter)
    filter.connect(noiseGain)
    oscillator.connect(toneGain)
    toneGain.connect(master)
    noiseGain.connect(master)

    const toneLevel = sound.tone === 'deep' ? 0.18 : 0.11
    const noiseLevel = sound.tone === 'small' ? 0.035 : 0.06

    toneGain.gain.setValueAtTime(0.0001, start)
    toneGain.gain.exponentialRampToValueAtTime(toneLevel, start + 0.015)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, start + burstDuration)

    noiseGain.gain.setValueAtTime(0.0001, start)
    noiseGain.gain.exponentialRampToValueAtTime(noiseLevel, start + 0.01)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, start + burstDuration)

    oscillator.start(start)
    oscillator.stop(start + burstDuration)
    noise.start(start)
    noise.stop(start + burstDuration)
  }

  const endTime = now + sound.bursts * (burstDuration + gap) + 0.08
  master.gain.exponentialRampToValueAtTime(0.0001, endTime)
  const timeoutId = window.setTimeout(() => {
    master.disconnect()
    onDone()
  }, Math.ceil((endTime - now) * 1000) + 80)

  return {
    stop() {
      window.clearTimeout(timeoutId)
      master.gain.cancelScheduledValues(context.currentTime)
      master.gain.setTargetAtTime(0.0001, context.currentTime, 0.015)
      window.setTimeout(() => {
        master.disconnect()
        onDone()
      }, 80)
    },
  }
}

export default function LaughWindow() {
  const nhacApp = useMemo(() => window.nhacApp ?? fallbackNhacApp, [])
  const audioContextRef = useRef<AudioContext | null>(null)
  const activeSoundRef = useRef<{ stop: () => void } | null>(null)
  const [activeId, setActiveId] = useState('')
  const [status, setStatus] = useState('Sẵn sàng')
  const [volume, setVolume] = useState(70)

  useEffect(() => {
    return () => {
      activeSoundRef.current?.stop()
      audioContextRef.current?.close().catch(() => {})
    }
  }, [])

  async function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass()
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }
    return audioContextRef.current
  }

  async function playLaugh(sound: LaughSound) {
    try {
      const context = await getAudioContext()
      const previousSound = activeSoundRef.current
      activeSoundRef.current = null
      previousSound?.stop()

      let currentSound: { stop: () => void } | null = null
      currentSound = playSyntheticLaugh(context, sound, volume / 100, () => {
        if (activeSoundRef.current === currentSound) {
          activeSoundRef.current = null
        }
      })
      activeSoundRef.current = currentSound
      setActiveId(sound.id)
      setStatus(`Đang phát: ${sound.label}`)
      window.setTimeout(() => {
        setActiveId((current) => (current === sound.id ? '' : current))
      }, 700)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không phát được âm thanh')
    }
  }

  function stopLaugh() {
    activeSoundRef.current?.stop()
    activeSoundRef.current = null
    setActiveId('')
    setStatus('Đã dừng')
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-2">
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="drag-region flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Smile className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight">Bảng tiếng cười</h1>
              <p className="text-[10px] text-muted-foreground">Phát âm thanh trực tiếp trong app</p>
            </div>
          </div>
          <button
            onClick={() => nhacApp.closeCurrentWindow()}
            className="no-drag p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2">
          <div className="grid grid-cols-3 gap-1.5">
            {LAUGH_SOUNDS.map((sound) => (
              <button
                key={sound.id}
                onClick={() => playLaugh(sound)}
                className={`no-drag min-h-[34px] rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all cursor-pointer ${
                  activeId === sound.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted'
                }`}
                title={sound.label}
              >
                {sound.label}
              </button>
            ))}
          </div>

          <div className="mt-2 rounded-lg bg-background border border-border px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground truncate">{status}</span>
              <div className="flex items-center gap-1 text-primary">
                <Volume2 className="w-3 h-3" />
                <span className="text-[10px] font-mono">{volume}%</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="no-drag mt-1 w-full accent-primary cursor-pointer"
            />
            <button
              onClick={stopLaugh}
              className="no-drag mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground cursor-pointer"
            >
              <Square className="w-3 h-3" />
              Dừng âm thanh
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
