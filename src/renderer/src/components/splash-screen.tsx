import { useEffect, useState } from 'react'
import logo from '../../../assets/logo.png'

export default function SplashScreen() {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter')

  useEffect(() => {
    // Phase enter → show
    const t1 = setTimeout(() => setPhase('show'), 100)
    // Phase show → exit (main window will close this)
    const t2 = setTimeout(() => setPhase('exit'), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* Outer glow ring */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: phase === 'enter' ? 0 : phase === 'exit' ? 0 : 1,
        transform: phase === 'enter' ? 'scale(0.7)' : phase === 'exit' ? 'scale(1.1)' : 'scale(1)',
        transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Animated glow rings */}
        <div style={{
          position: 'absolute',
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,140,60,0.25) 0%, transparent 70%)',
          animation: 'pulse-ring 2s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: '50%',
          border: '1px solid rgba(180,140,60,0.3)',
          animation: 'pulse-ring 2s ease-in-out infinite 0.3s',
        }} />
        <div style={{
          position: 'absolute',
          width: 100,
          height: 100,
          borderRadius: '50%',
          border: '1px solid rgba(180,140,60,0.15)',
          animation: 'pulse-ring 2s ease-in-out infinite 0.6s',
        }} />

        {/* Logo */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          overflow: 'hidden',
          background: '#000',
          boxShadow: '0 0 40px 10px rgba(180,140,60,0.5), 0 20px 60px rgba(0,0,0,0.8)',
          position: 'relative',
          zIndex: 1,
          animation: 'logo-breathe 3s ease-in-out infinite',
        }}>
          <img
            src={logo}
            alt="TC Studio"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      </div>

      {/* Text */}
      <div style={{
        marginTop: 24,
        textAlign: 'center',
        opacity: phase === 'show' ? 1 : 0,
        transform: phase === 'show' ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s',
      }}>
        <div style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#f1f5f9',
          letterSpacing: '0.05em',
        }}>
          TC Studio
        </div>
        <div style={{
          fontSize: 11,
          color: 'rgba(180,140,60,0.8)',
          marginTop: 4,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}>
          Tone Detection Studio
        </div>
      </div>

      {/* Loading dots */}
      <div style={{
        marginTop: 32,
        display: 'flex',
        gap: 6,
        opacity: phase === 'show' ? 1 : 0,
        transition: 'opacity 0.4s ease 0.6s',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'rgba(180,140,60,0.7)',
            animation: `dot-bounce 1.2s ease-in-out infinite ${i * 0.2}s`,
          }} />
        ))}
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes logo-breathe {
          0%, 100% { box-shadow: 0 0 30px 6px rgba(180,140,60,0.4), 0 20px 60px rgba(0,0,0,0.8); }
          50% { box-shadow: 0 0 50px 14px rgba(180,140,60,0.65), 0 20px 60px rgba(0,0,0,0.8); }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
