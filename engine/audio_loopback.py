import threading
import time
from typing import Callable, Optional

import numpy as np

try:
    import soundcard as sc
except ImportError:  # pragma: no cover - reported at runtime by the engine.
    sc = None

from key_detector import detect_key


class RealtimeAnalyzer:
    def __init__(
        self,
        emit: Callable[[dict], None],
        sample_rate: int = 22050,
        window_seconds: float = 2.0,
        hop_seconds: float = 0.5,
        mode: str = "fast",
    ):
        self.emit = emit
        self.sample_rate = sample_rate
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
        self.mode = mode
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.running:
            return
        if sc is None:
            raise RuntimeError("Missing dependency: soundcard. Install Python requirements first.")

        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="audio-loopback", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None

    def _run(self) -> None:
        chunk_frames = int(self.sample_rate * self.hop_seconds)
        window_frames = int(self.sample_rate * self.window_seconds)
        chunks: list[np.ndarray] = []

        try:
            speaker = sc.default_speaker()
            mic = sc.get_microphone(speaker.name, include_loopback=True)
            self.emit(
                {
                    "type": "analyzer_status",
                    "status": "capturing",
                    "source": "WASAPI loopback",
                    "mode": self.mode,
                    "window_seconds": self.window_seconds,
                    "hop_seconds": self.hop_seconds,
                }
            )
            with mic.recorder(samplerate=self.sample_rate, channels=2, blocksize=chunk_frames) as recorder:
                while not self._stop.is_set():
                    capture_started = time.time()
                    chunk = np.asarray(recorder.record(numframes=chunk_frames))
                    capture_ms = int((time.time() - capture_started) * 1000)
                    chunks.append(chunk)

                    total_frames = sum(item.shape[0] for item in chunks)
                    while chunks and total_frames - chunks[0].shape[0] >= window_frames:
                        total_frames -= chunks[0].shape[0]
                        chunks.pop(0)

                    if total_frames < self.sample_rate:
                        continue

                    samples = np.concatenate(chunks, axis=0)
                    if samples.shape[0] > window_frames:
                        samples = samples[-window_frames:]

                    self.emit(
                        {
                            "type": "analyzer_status",
                            "status": "analyzing",
                            "source": "WASAPI loopback",
                            "window_seconds": round(samples.shape[0] / self.sample_rate, 2),
                            "mode": self.mode,
                        }
                    )
                    started = time.time()
                    result = detect_key(samples, self.sample_rate, self.mode)
                    self.emit(
                        {
                            "type": "tone",
                            "key": result.key,
                            "confidence": result.confidence,
                            "source": "WASAPI loopback",
                            "capture_ms": capture_ms,
                            "analysis_ms": int((time.time() - started) * 1000),
                            "window_seconds": round(samples.shape[0] / self.sample_rate, 2),
                            "hop_seconds": self.hop_seconds,
                            "mode": self.mode,
                        }
                    )
        except Exception as error:
            self.emit({"type": "error", "message": str(error)})
