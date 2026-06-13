import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Star, Trash2, X } from 'lucide-react'

const fallbackNhacApp: Window['nhacApp'] = {
  getConfig: async () => ({}),
  saveConfig: async (config) => config,
  listFavorites: async () => [],
  saveFavorite: async (song) => [song],
  deleteFavorite: async () => [],
  selectCubase: async () => '',
  launchYoutube: async () => false,
  closeYoutube: async () => false,
  launchCubase: async () => false,
  exportPreset: async () => ({ saved: false }),
  importPreset: async () => ({ imported: false }),
  openSettingsWindow: async () => false,
  openLaughWindow: async () => false,
  openFavoritesWindow: async () => false,
  closeCurrentWindow: async () => false,
  setMainWindowSize: async () => false,
  engineRequest: async () => ({}),
  stopEngineProcess: async () => false,
  onYoutubeVideoSelected: () => {},
  onYoutubePlaybackState: () => {},
  onEngineEvent: () => {},
  onEngineLog: () => {},
  onConfigChanged: () => {},
  onFavoritesChanged: () => {},
  minimizeWindow: async () => false,
  setAlwaysOnTop: async () => false,
  relaunchApp: async () => false,
  minimizeCurrentWindow: async () => false,
  quitApp: async () => false,
  selectAudioFile: async () => null,
  readAudioFile: async () => ({ ok: false }),
  youtubeTogglePin: async () => false,
  youtubeIsPinned: async () => false,
  sendYoutubePlaybackState: () => {},
  sendYoutubeVideoSelected: () => {},
  activateLicense: async () => ({ valid: false }),
  verifyLicense: async () => ({ valid: false }),
  deactivateLicense: async () => ({ success: false }),
  checkUpdate: async () => ({ has_update: false }),
  getLicenseInfo: async () => null,
}

function formatSongTime(seconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export default function FavoritesWindow() {
  const nhacApp = useMemo(() => window.nhacApp ?? fallbackNhacApp, [])
  const [songs, setSongs] = useState<FavoriteSong[]>([])

  useEffect(() => {
    nhacApp.listFavorites?.().then(setSongs).catch(console.error)
    return nhacApp.onFavoritesChanged?.((nextSongs) => setSongs(nextSongs))
  }, [nhacApp])

  async function deleteSong(videoId: string) {
    const nextSongs = await nhacApp.deleteFavorite?.(videoId)
    if (nextSongs) setSongs(nextSongs)
  }

  async function openSong(song: FavoriteSong) {
    if (!song.url) return
    await nhacApp.launchYoutube(song.url)
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-2">
      <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="drag-region flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <h1 className="text-sm font-bold leading-tight flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400/30" />
              Bài hát yêu thích
            </h1>
            <p className="text-[10px] text-muted-foreground">Lưu tone chính và mốc chuyển tone cao trào</p>
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
          {songs.length === 0 ? (
            <div className="rounded-lg border border-border bg-background px-3 py-8 text-center">
              <p className="text-sm text-foreground font-medium">Chưa có bài yêu thích</p>
              <p className="text-[10px] text-muted-foreground mt-1">Bấm nút sao trên toolbar khi đang nghe YouTube.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {songs.map((song) => (
                <div key={song.videoId} className="rounded-lg border border-border bg-background p-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-foreground">{song.title || song.videoId}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Tone: {song.mainTone || '--'}</span>
                      </div>
                      {song.transitions && song.transitions.length > 0 && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {song.transitions.map((item) => `${formatSongTime(item.time)} ${item.tone}`).join(' | ')}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openSong(song)}
                        disabled={!song.url}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                        title="Mở bài"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteSong(song.videoId)}
                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Xóa"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
