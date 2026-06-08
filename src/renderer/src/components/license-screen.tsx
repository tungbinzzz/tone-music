import { useState } from 'react'
import logo from '../../../assets/logo.png'
import { KeyRound, ShieldCheck, ShieldX, Loader2, Wifi, WifiOff, Trash2 } from 'lucide-react'

type LicenseStatus = 'idle' | 'checking' | 'activating' | 'valid' | 'invalid' | 'offline'

interface LicenseInfo {
  plan?: string
  message?: string
  source?: string
}

interface LicenseScreenProps {
  /** Called when a valid license is confirmed */
  onLicensed: (plan: string) => void
}

const nhacApp = () => window.nhacApp ?? null

export default function LicenseScreen({ onLicensed }: LicenseScreenProps) {
  const [key, setKey]         = useState('')
  const [status, setStatus]   = useState<LicenseStatus>('idle')
  const [info, setInfo]       = useState<LicenseInfo>({})
  const [showDeact, setShowDeact] = useState(false)

  async function handleActivate() {
    const trimmed = key.trim().toUpperCase()
    if (!trimmed) return
    setStatus('activating')
    setInfo({})

    try {
      const result = await (window as any).nhacApp?.activateLicense?.(trimmed)
      if (result?.valid) {
        setStatus('valid')
        setInfo({ plan: result.plan, message: result.message })
        setTimeout(() => onLicensed(result.plan ?? 'standard'), 1200)
      } else {
        setStatus('invalid')
        setInfo({ message: result?.message || 'Activation failed' })
      }
    } catch (e: any) {
      setStatus('invalid')
      setInfo({ message: 'Cannot connect to license server' })
    }
  }

  async function handleDeactivate() {
    setStatus('checking')
    await (window as any).nhacApp?.deactivateLicense?.()
    setStatus('idle')
    setInfo({ message: 'Deactivated successfully' })
    setShowDeact(false)
    setKey('')
  }

  const isLoading = status === 'activating' || status === 'checking'

  const statusBadge = () => {
    if (status === 'valid') return (
      <div className="flex items-center gap-2 text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2 text-sm">
        <ShieldCheck className="w-4 h-4" />
        <span>{info.message ?? 'License activated!'}</span>
      </div>
    )
    if (status === 'invalid') return (
      <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 text-sm">
        <ShieldX className="w-4 h-4" />
        <span>{info.message ?? 'Invalid license'}</span>
      </div>
    )
    if (status === 'offline') return (
      <div className="flex items-center gap-2 text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 text-sm">
        <WifiOff className="w-4 h-4" />
        <span>{info.message ?? 'Offline mode'}</span>
      </div>
    )
    if (info.message && status === 'idle') return (
      <div className="flex items-center gap-2 text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm">
        <span>{info.message}</span>
      </div>
    )
    return null
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Drag region titlebar */}
      <div className="drag-region flex items-center justify-between px-3 py-2 shrink-0">
        <span className="text-[10px] text-muted-foreground/50 select-none">ToneLink</span>
        <button
          onClick={() => (window as any).nhacApp?.quitApp?.()}
          className="no-drag p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
          title="Đóng"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent px-6 pt-8 pb-6 flex flex-col items-center gap-3">
            <div
              className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center bg-black shadow-xl"
              style={{ boxShadow: '0 0 24px 4px rgba(180,140,60,0.4)' }}
            >
              <img src={logo} alt="TC Studio" className="w-full h-full object-cover" />
            </div>
            <div className="text-center">
              <h1 className="text-lg font-bold text-foreground">ToneLink</h1>
              <p className="text-xs text-muted-foreground mt-0.5">TC Studio · License Activation</p>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 pb-6 space-y-4">
            {/* License key input */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">License Key</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={key}
                  onChange={e => {
                    setKey(e.target.value.toUpperCase())
                    if (status !== 'idle') { setStatus('idle'); setInfo({}) }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter' && !isLoading) handleActivate() }}
                  placeholder="TL-XXXX-XXXX-XXXX"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono text-sm transition-all"
                  disabled={isLoading || status === 'valid'}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Status badge */}
            {statusBadge()}

            {/* Activate button */}
            <button
              onClick={handleActivate}
              disabled={isLoading || !key.trim() || status === 'valid'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Đang kích hoạt...</>
              ) : status === 'valid' ? (
                <><ShieldCheck className="w-4 h-4" /> Đã kích hoạt</>
              ) : (
                <><KeyRound className="w-4 h-4" /> Kích hoạt License</>
              )}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-[10px] text-muted-foreground uppercase tracking-wide">Tùy chọn</span>
              </div>
            </div>

            {/* Deactivate */}
            {!showDeact ? (
              <button
                onClick={() => setShowDeact(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-muted-foreground text-xs hover:border-destructive/50 hover:text-destructive transition-all"
              >
                <Trash2 className="w-3 h-3" />
                Hủy kích hoạt máy này
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">Xác nhận hủy kích hoạt machine này?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeact(false)}
                    className="flex-1 py-1.5 rounded-lg border border-border text-muted-foreground text-xs hover:bg-muted transition-all"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleDeactivate}
                    className="flex-1 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 transition-all"
                  >
                    Xác nhận xóa
                  </button>
                </div>
              </div>
            )}

            {/* Footer note */}
            <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">
              License được kiểm tra khi khởi động.<br />
              Offline hoạt động trong 7 ngày sau lần verify cuối.
            </p>
          </div>
        </div>

        {/* Offline hint */}
        <p className="text-center text-[10px] text-muted-foreground/40 mt-3 flex items-center justify-center gap-1">
          <Wifi className="w-3 h-3" /> Cần internet để kích hoạt lần đầu
        </p>
      </div>
      </div>
    </div>
  )
}
