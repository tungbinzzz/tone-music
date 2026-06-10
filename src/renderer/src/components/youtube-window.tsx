import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, Pin, PinOff, Lock, Loader2 } from 'lucide-react'

// Helper to extract YouTube video ID from URL
function getYoutubeVideoId(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v') || ''
    }
    if (host === 'youtube.com' && parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/').filter(Boolean)[1] || ''
    }
    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || ''
    }
  } catch {
    return ''
  }
  return ''
}

export default function YoutubeWindow() {
  const queryParams = new URLSearchParams(window.location.search)
  const initialUrl = queryParams.get('url') || 'https://www.youtube.com'

  const webviewRef = useRef<HTMLWebViewElement>(null)
  const [urlInput, setUrlInput] = useState(initialUrl)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Initialize pin state
  useEffect(() => {
    ;(async () => {
      if (window.nhacApp?.youtubeIsPinned) {
        const pinned = await window.nhacApp.youtubeIsPinned()
        setIsPinned(pinned)
      }
    })()
  }, [])

  const handleTogglePin = async () => {
    if (window.nhacApp?.youtubeTogglePin) {
      const nextPinned = await window.nhacApp.youtubeTogglePin()
      setIsPinned(nextPinned)
    }
  }

  const handleGoBack = () => {
    const webview = webviewRef.current
    if (webview && webview.canGoBack()) {
      webview.goBack()
    }
  }

  const handleGoForward = () => {
    const webview = webviewRef.current
    if (webview && webview.canGoForward()) {
      webview.goForward()
    }
  }

  const handleReload = () => {
    const webview = webviewRef.current
    if (webview) {
      webview.reload()
    }
  }

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let targetUrl = urlInput.trim()
    if (!targetUrl) return

    // Prepend protocol if missing
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl
    }

    const webview = webviewRef.current
    if (webview) {
      webview.loadURL(targetUrl)
    }
  }

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleNavigate = (e: any) => {
      const url = e.url
      setCurrentUrl(url)
      setUrlInput(url)
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())

      // Forward video details back to main app
      const videoId = getYoutubeVideoId(url)
      if (window.nhacApp?.sendYoutubeVideoSelected) {
        window.nhacApp.sendYoutubeVideoSelected({ videoId, url })
      }
    }

    const handleStartLoading = () => {
      setIsLoading(true)
    }

    const handleStopLoading = () => {
      setIsLoading(false)
      const url = webview.getURL()
      setCurrentUrl(url)
      setUrlInput(url)
      setCanGoBack(webview.canGoBack())
      setCanGoForward(webview.canGoForward())

      // Initial video detection on load finish
      const videoId = getYoutubeVideoId(url)
      if (window.nhacApp?.sendYoutubeVideoSelected) {
        window.nhacApp.sendYoutubeVideoSelected({ videoId, url })
      }
    }

    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)

    // Poll playback state
    let lastPlayingState: boolean | null = null
    const playbackInterval = setInterval(async () => {
      try {
        const playing = await webview.executeJavaScript(
          '(function(){ var v = document.querySelector("video"); return v ? !v.paused && !v.ended && v.readyState > 2 : false; })()'
        )
        const isPlaying = !!playing
        if (isPlaying !== lastPlayingState) {
          lastPlayingState = isPlaying
          if (window.nhacApp?.sendYoutubePlaybackState) {
            window.nhacApp.sendYoutubePlaybackState(isPlaying)
          }
        }
      } catch (_) {
        // Ignored, webview not ready or not loaded
      }
    }, 1000)

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      clearInterval(playbackInterval)
    }
  }, [])

  return (
    <div className="w-full h-screen flex flex-col bg-background select-none overflow-hidden">
      {/* Premium Navigation Toolbar */}
      <div className="h-11 flex items-center gap-2 px-3 border-b border-border bg-card/60 backdrop-blur-md z-10">
        {/* History Buttons */}
        <button
          onClick={handleGoBack}
          disabled={!canGoBack}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent transition-all active:scale-95"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <button
          onClick={handleGoForward}
          disabled={!canGoForward}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent transition-all active:scale-95"
          title="Forward"
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={handleReload}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-all active:scale-95"
          title="Reload"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-primary' : ''}`} />
        </button>

        {/* Address Bar */}
        <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center bg-input border border-border rounded-md px-3 py-1 text-sm text-muted-foreground focus-within:text-foreground focus-within:border-primary transition-all duration-200">
          <div className="flex items-center gap-1.5 mr-2">
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-primary/80" />
            )}
          </div>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground/50 selection:bg-primary/20"
            placeholder="Search or enter URL"
          />
        </form>

        {/* Pin (Always-on-top) Button */}
        <button
          onClick={handleTogglePin}
          className={`p-1.5 rounded-md border transition-all active:scale-95 ${
            isPinned
              ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
          title={isPinned ? 'Unpin window' : 'Pin window always on top'}
        >
          {isPinned ? <Pin className="w-4 h-4 fill-primary/20" /> : <PinOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Guest Webview */}
      <div className="flex-1 w-full bg-[#111] overflow-hidden">
        <webview
          ref={webviewRef as any}
          src={initialUrl}
          className="w-full h-full border-none"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        />
      </div>
    </div>
  )
}
