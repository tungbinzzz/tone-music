import { useState } from 'react'
import logo from '../../../assets/logo.png'
import { KeyRound, ShieldCheck, ShieldX, Loader2, WifiOff, X } from 'lucide-react'

type Status = 'idle' | 'activating' | 'valid' | 'invalid'

interface LicenseScreenProps {
  onLicensed: (plan: string) => void
}

export default function LicenseScreen({ onLicensed }: LicenseScreenProps) {
  const [key, setKey]       = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [msg, setMsg]       = useState('')
  const [showDeact, setShowDeact] = useState(false)

  const isLoading = status === 'activating'

  async function handleActivate() {
    const trimmed = key.trim().toUpperCase()
    if (!trimmed || isLoading) return
    setStatus('activating')
    setMsg('')
    try {
      const result = await (window as any).nhacApp?.activateLicense?.(trimmed)
      if (result?.valid) {
        setStatus('valid')
        setMsg(result.message || 'Kích hoạt thành công!')
        setTimeout(() => onLicensed(result.plan ?? 'standard'), 1400)
      } else {
        setStatus('invalid')
        setMsg(result?.message === 'DEVICE_LIMIT_REACHED'
          ? 'Đã đạt giới hạn số thiết bị'
          : result?.message === 'License key not found'
          ? 'Không tìm thấy license key'
          : result?.message || 'Kích hoạt thất bại')
      }
    } catch {
      setStatus('invalid')
      setMsg('Không thể kết nối đến server')
    }
  }

  async function handleDeactivate() {
    await (window as any).nhacApp?.deactivateLicense?.()
    setShowDeact(false)
    setKey('')
    setStatus('idle')
    setMsg('Đã hủy kích hoạt thành công')
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d1117',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#e2e8f0',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* Activating overlay */}
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(13,17,23,0.97)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24,
          animation: 'fadeIn 0.3s ease',
        }}>
          {/* Spinning logo */}
          <div style={{ position: 'relative', width: 90, height: 90 }}>
            {/* Outer spinning ring */}
            <div style={{
              position: 'absolute', inset: -8,
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: 'rgba(180,140,60,0.9)',
              borderRightColor: 'rgba(180,140,60,0.3)',
              animation: 'spin 1s linear infinite',
            }} />
            {/* Inner spinning ring */}
            <div style={{
              position: 'absolute', inset: -16,
              borderRadius: '50%',
              border: '1px solid transparent',
              borderTopColor: 'rgba(180,140,60,0.3)',
              animation: 'spin 1.5s linear infinite reverse',
            }} />
            {/* Logo */}
            <div style={{
              width: 90, height: 90, borderRadius: 20, overflow: 'hidden',
              background: '#000',
              boxShadow: '0 0 30px 8px rgba(180,140,60,0.4)',
            }}>
              <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>Đang kích hoạt...</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>Vui lòng chờ</div>
          </div>
          {/* Animated dots */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'rgba(180,140,60,0.7)',
                animation: `dotBounce 1.2s ease-in-out infinite ${i * 0.2}s`,
              }} />
            ))}
          </div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes dotBounce {
              0%,80%,100% { transform: translateY(0); opacity: 0.4; }
              40% { transform: translateY(-6px); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Background logo watermark */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 0,
      }}>
        <img
          src={logo}
          alt=""
          style={{
            width: 320,
            height: 320,
            objectFit: 'cover',
            opacity: 0.06,
            filter: 'blur(2px)',
            borderRadius: 32,
          }}
        />
      </div>

      {/* Titlebar drag region */}
      <div
        className="drag-region"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.4)', userSelect: 'none' }}>
          ToneLink · TC Studio
        </span>
        <button
          className="no-drag"
          onClick={() => (window as any).nhacApp?.quitApp?.()}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            borderRadius: 4,
            color: 'rgba(148,163,184,0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(248,113,113,0.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(148,163,184,0.4)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px 24px',
        zIndex: 1,
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>

          {/* Logo + title */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              overflow: 'hidden',
              background: '#000',
              boxShadow: '0 0 30px 6px rgba(180,140,60,0.45)',
              flexShrink: 0,
            }}>
              <img src={logo} alt="TC Studio" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>ToneLink</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Kích hoạt bản quyền</div>
            </div>
          </div>

          {/* Card */}
          <div style={{
            background: 'rgba(17,24,39,0.85)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: '20px 20px 16px',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>

            {/* Label */}
            <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              License Key
            </label>

            {/* Input */}
            <div style={{ position: 'relative' }}>
              <KeyRound
                size={15}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }}
              />
              <input
                type="text"
                value={key}
                onChange={e => {
                  setKey(e.target.value.toUpperCase())
                  if (status !== 'idle') { setStatus('idle'); setMsg('') }
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleActivate() }}
                placeholder="TL-XXXX-XXXX-XXXX"
                disabled={isLoading || status === 'valid'}
                spellCheck={false}
                autoComplete="off"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px 10px 36px',
                  background: '#0d1117',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  color: '#f1f5f9',
                  fontFamily: 'Consolas, monospace',
                  fontSize: 13,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(45,212,191,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>

            {/* Status message */}
            {msg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                ...(status === 'valid'
                  ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }
                  : status === 'invalid'
                  ? { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }
                  : { background: 'rgba(100,116,139,0.1)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.2)' }
                ),
              }}>
                {status === 'valid' ? <ShieldCheck size={14} /> : status === 'invalid' ? <ShieldX size={14} /> : <WifiOff size={14} />}
                <span>{msg}</span>
              </div>
            )}

            {/* Activate button */}
            <button
              onClick={handleActivate}
              disabled={isLoading || !key.trim() || status === 'valid'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '11px',
                borderRadius: 10,
                border: 'none',
                background: status === 'valid' ? 'rgba(34,197,94,0.2)' : 'rgba(45,212,191,0.85)',
                color: status === 'valid' ? '#4ade80' : '#0d1117',
                fontWeight: 600,
                fontSize: 13,
                cursor: isLoading || !key.trim() || status === 'valid' ? 'not-allowed' : 'pointer',
                opacity: !key.trim() && status !== 'valid' ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              {isLoading ? (
                <><Loader2 size={15} className="animate-spin" /> Đang kích hoạt...</>
              ) : status === 'valid' ? (
                <><ShieldCheck size={15} /> Đã kích hoạt!</>
              ) : (
                <><KeyRound size={15} /> Kích hoạt License</>
              )}
            </button>

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '2px 0' }} />

            {/* Deactivate */}
            {!showDeact ? (
              <button
                onClick={() => setShowDeact(true)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                  color: '#475569',
                  fontSize: 11,
                  padding: '7px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(248,113,113,0.3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#475569'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.07)'; }}
              >
                Hủy kích hoạt máy này
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', margin: 0 }}>Xác nhận hủy kích hoạt?</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowDeact(false)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer' }}>
                    Hủy bỏ
                  </button>
                  <button onClick={handleDeactivate} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    Xác nhận
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <p style={{ fontSize: 10, color: '#334155', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              Cần internet để kích hoạt lần đầu · Offline 7 ngày
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
