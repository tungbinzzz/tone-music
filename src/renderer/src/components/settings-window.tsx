import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, RefreshCw, X } from 'lucide-react'

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

export default function SettingsWindow() {
  const nhacApp = useMemo(() => window.nhacApp ?? fallbackNhacApp, [])
  const [tab, setTab] = useState<'midi' | 'config'>('midi')
  const [midiOutputs, setMidiOutputs] = useState<string[]>([])
  const [midiInputs, setMidiInputs] = useState<string[]>([])
  const [config, setConfig] = useState({
    youtubeUrl: 'https://www.youtube.com',
    pythonPath: 'python',
    cubasePath: '',
    midiOutputName: '',
    midiInputName: '',
    autoSendKey: false,
    autoLaunchYoutube: true,
    autoLaunchCubase: true,
  })

  useEffect(() => {
    nhacApp.getConfig().then((nextConfig) => {
      setConfig((current) => ({ ...current, ...nextConfig }))
      if (nextConfig.midiOutputName) setMidiOutputs([nextConfig.midiOutputName])
      if (nextConfig.midiInputName) setMidiInputs([nextConfig.midiInputName])
    })
  }, [nhacApp])

  async function save(nextConfig = config) {
    const saved = await nhacApp.saveConfig(nextConfig)
    setConfig((current) => ({ ...current, ...saved }))
  }

  async function refreshMidi() {
    const [outputs, inputs] = await Promise.all([
      nhacApp.engineRequest('list_midi_outputs'),
      nhacApp.engineRequest('list_midi_inputs'),
    ])
    setMidiOutputs(outputs.ports || [])
    setMidiInputs(inputs.ports || [])
  }

  async function chooseCubase() {
    const filePath = await nhacApp.selectCubase()
    if (!filePath) return
    const next = { ...config, cubasePath: filePath }
    setConfig(next)
    await save(next)
  }

  async function setField<K extends keyof typeof config>(key: K, value: (typeof config)[K]) {
    const next = { ...config, [key]: value }
    setConfig(next)
    await save(next)
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-2">
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="drag-region flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <h1 className="text-sm font-bold leading-tight">ToneLink Settings</h1>
            <p className="text-[10px] text-muted-foreground">MIDI and app config</p>
          </div>
          <button
            onClick={() => nhacApp.closeCurrentWindow()}
            className="no-drag p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2">
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setTab('midi')}
              className={`px-2 py-1 rounded-md text-[10px] font-medium ${tab === 'midi' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              MIDI
            </button>
            <button
              onClick={() => setTab('config')}
              className={`px-2 py-1 rounded-md text-[10px] font-medium ${tab === 'config' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              Config
            </button>
          </div>

          {tab === 'midi' ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">MIDI output</span>
                <select
                  value={config.midiOutputName}
                  onChange={(event) => setField('midiOutputName', event.target.value)}
                  className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px]"
                >
                  {(midiOutputs.length ? midiOutputs : [config.midiOutputName || '']).map((port) => (
                    <option key={port} value={port}>
                      {port || 'No MIDI output selected'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">Feedback input</span>
                <select
                  value={config.midiInputName}
                  onChange={async (event) => {
                    await setField('midiInputName', event.target.value)
                    if (event.target.value) {
                      await nhacApp.engineRequest('start_midi_feedback', { midi_input_name: event.target.value })
                    }
                  }}
                  className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px]"
                >
                  {(midiInputs.length ? midiInputs : [config.midiInputName || '']).map((port) => (
                    <option key={port} value={port}>
                      {port || 'No MIDI input selected'}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-1 pt-1">
                <button onClick={refreshMidi} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]">
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
                <button
                  onClick={() => nhacApp.engineRequest('set_cubase_cc', { channel: 0, control: 23, value: 127, midi_output_name: config.midiOutputName })}
                  className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]"
                >
                  Test CC23
                </button>
                <button onClick={() => nhacApp.exportPreset({ name: 'ToneLink preset', version: 1, controls: {} })} className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]">
                  Save preset
                </button>
                <button onClick={() => nhacApp.importPreset()} className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]">
                  Import preset
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">YouTube URL</span>
                <input value={config.youtubeUrl} onChange={(event) => setConfig((current) => ({ ...current, youtubeUrl: event.target.value }))} onBlur={() => save()} className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px]" />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">Python</span>
                <input value={config.pythonPath} onChange={(event) => setConfig((current) => ({ ...current, pythonPath: event.target.value }))} onBlur={() => save()} className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px]" />
              </label>
              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">Cubase</span>
                <div className="flex gap-1">
                  <input value={config.cubasePath} onChange={(event) => setConfig((current) => ({ ...current, cubasePath: event.target.value }))} onBlur={() => save()} className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-[10px]" />
                  <button onClick={chooseCubase} className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80">
                    <FolderOpen className="w-3 h-3" />
                  </button>
                </div>
              </label>
              <label className="flex items-center gap-2 text-[10px]">
                <input type="checkbox" checked={config.autoLaunchYoutube} onChange={(event) => setField('autoLaunchYoutube', event.target.checked)} className="accent-primary" />
                Auto open YouTube when app starts
              </label>
              <label className="flex items-center gap-2 text-[10px]">
                <input type="checkbox" checked={config.autoLaunchCubase} onChange={(event) => setField('autoLaunchCubase', event.target.checked)} className="accent-primary" />
                Auto open Cubase when app starts
              </label>
              <button onClick={() => save()} className="w-full px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-medium">
                Save config
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
