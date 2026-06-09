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
}

export default function SettingsWindow() {
  const nhacApp = useMemo(() => window.nhacApp ?? fallbackNhacApp, [])
  const [tab, setTab] = useState<'midi' | 'config'>('midi')
  const [saveStatus, setSaveStatus] = useState('')
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
    return nhacApp.onConfigChanged((nextConfig) => {
      setConfig((current) => ({ ...current, ...nextConfig }))
      if (nextConfig.midiOutputName) setMidiOutputs((current) => (
        current.includes(nextConfig.midiOutputName || '') ? current : [nextConfig.midiOutputName || '', ...current].filter(Boolean)
      ))
      if (nextConfig.midiInputName) setMidiInputs((current) => (
        current.includes(nextConfig.midiInputName || '') ? current : [nextConfig.midiInputName || '', ...current].filter(Boolean)
      ))
    })
  }, [nhacApp])

  async function applyRuntimeConfig(saved: typeof config) {
    if (saved.midiOutputName) {
      await nhacApp.engineRequest('configure', { midi_output_name: saved.midiOutputName })
    }
    if (saved.midiInputName) {
      await nhacApp.engineRequest('start_midi_feedback', { midi_input_name: saved.midiInputName })
    }
  }

  async function save(nextConfig = config, showSavedStatus = false) {
    const saved = await nhacApp.saveConfig(nextConfig)
    setConfig((current) => ({ ...current, ...saved }))
    if (showSavedStatus) {
      await applyRuntimeConfig({ ...config, ...saved })
      if (!saved.autoLaunchYoutube) {
        await nhacApp.closeYoutube()
      }
      setSaveStatus('Đã lưu cài đặt')
    }
    return saved
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
    setSaveStatus('')
    const next = { ...config, cubasePath: filePath }
    setConfig(next)
  }

  function setField<K extends keyof typeof config>(key: K, value: (typeof config)[K]) {
    const next = { ...config, [key]: value }
    setSaveStatus('')
    setConfig(next)
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-2">
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="drag-region flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <h1 className="text-sm font-bold leading-tight">Cài đặt TC Studio</h1>
            <p className="text-[10px] text-muted-foreground">Cấu hình MIDI và ứng dụng</p>
          </div>
          <button
            onClick={() => nhacApp.closeCurrentWindow()}
            className="no-drag p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Đóng"
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
              Ứng dụng
            </button>
          </div>

          {tab === 'midi' ? (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">MIDI gửi sang Cubase</span>
                <select
                  value={config.midiOutputName}
                  onChange={(event) => setField('midiOutputName', event.target.value)}
                  className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px]"
                >
                  {(midiOutputs.length ? midiOutputs : [config.midiOutputName || '']).map((port) => (
                    <option key={port} value={port}>
                      {port || 'Chưa chọn MIDI output'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">MIDI nhận từ Cubase</span>
                <select
                  value={config.midiInputName}
                  onChange={(event) => setField('midiInputName', event.target.value)}
                  className="w-full px-2 py-1 rounded-md bg-background border border-border text-[10px]"
                >
                  {(midiInputs.length ? midiInputs : [config.midiInputName || '']).map((port) => (
                    <option key={port} value={port}>
                      {port || 'Chưa chọn MIDI input'}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-1 pt-1">
                <button onClick={refreshMidi} className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]">
                  <RefreshCw className="w-3 h-3" />
                  Làm mới
                </button>
                <button
                  onClick={() => nhacApp.engineRequest('set_cubase_cc', { channel: 0, control: 23, value: 127, midi_output_name: config.midiOutputName })}
                  className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]"
                >
                  Test MIDI
                </button>
                <button onClick={() => nhacApp.exportPreset({ name: 'ToneLink preset', version: 1, controls: {} })} className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]">
                  Lưu preset
                </button>
                <button onClick={() => nhacApp.importPreset()} className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-[10px]">
                  Nhập preset
                </button>
              </div>
              <button onClick={() => save(config, true)} className="w-full px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-medium">
                {saveStatus || 'Lưu cài đặt'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase">Đường dẫn Cubase</span>
                <div className="flex gap-1">
                  <input value={config.cubasePath} onChange={(event) => {
                    setSaveStatus('')
                    setConfig((current) => ({ ...current, cubasePath: event.target.value }))
                  }} className="flex-1 px-2 py-1 rounded-md bg-background border border-border text-[10px]" />
                  <button onClick={chooseCubase} className="px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/80">
                    <FolderOpen className="w-3 h-3" />
                  </button>
                </div>
              </label>
              <label className="flex items-center gap-2 text-[10px]">
                <input type="checkbox" checked={config.autoLaunchYoutube} onChange={(event) => setField('autoLaunchYoutube', event.target.checked)} className="accent-primary" />
                Tự mở YouTube khi bật app
              </label>
              <label className="flex items-center gap-2 text-[10px]">
                <input type="checkbox" checked={config.autoLaunchCubase} onChange={(event) => setField('autoLaunchCubase', event.target.checked)} className="accent-primary" />
                Tự mở Cubase khi bật app
              </label>
              <button onClick={() => save(config, true)} className="w-full px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-medium">
                {saveStatus || 'Lưu cài đặt'}
              </button>
              <p className="text-[9px] text-muted-foreground text-center">
                Cài đặt tự mở sẽ có hiệu lực trong lần khởi động app tiếp theo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
