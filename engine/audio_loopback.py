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
        min_main_key_votes: int = 10,
        vote_confidence_threshold: float = 0.35,
    ):
        self.emit = emit
        self.sample_rate = sample_rate
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
        self.mode = mode
        self.min_main_key_votes = min_main_key_votes
        self.vote_confidence_threshold = vote_confidence_threshold
        
        self.base_min_votes = min_main_key_votes
        self.state = 0  # 0: INIT, 1: LOCKED_INITIAL, 2: TRANSITION, 3: LOCKED_CLIMAX
        self.current_locked_key = "--"
        self.current_locked_confidence = 0.0
        self._key_votes = 0
        self.max_history = 30  # Store last 15 seconds of history (30 frames * 0.5s)
        self._history: list[tuple[str, float]] = []
        self._rms_history: list[float] = [] # Track RMS values for transition/climax detection
        self._background_keys: list[str] = [] # Track background keys in locked initial state
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

    def reset_statistics(self) -> None:
        self._history = []
        self._key_votes = 0
        self._rms_history = []
        self._background_keys = []
        self.state = 0  # STATE_INIT
        self.current_locked_key = "--"
        self.current_locked_confidence = 0.0

    def _track_main_key(self, key_name: str, confidence: float) -> tuple[str, float]:
        # Track background keys while in LOCKED_INITIAL state for climax modulation detection
        if self.state == 1:
            if key_name != "--" and confidence >= self.vote_confidence_threshold:
                self._background_keys.append(key_name)
                if len(self._background_keys) > 6:  # Track last 3 seconds (6 frames * 0.5s)
                    self._background_keys.pop(0)
            # Override key_votes to match base_min_votes so frontend auto-sends key
            self._key_votes = self.base_min_votes
            return self.current_locked_key, self.current_locked_confidence

        if self.state == 3:
            # Override key_votes to 5 so frontend auto-sends climax key (where target votes is 5)
            self._key_votes = 5
            return self.current_locked_key, self.current_locked_confidence

        if key_name != "--" and confidence >= self.vote_confidence_threshold:
            self._history.append((key_name, confidence))
            if len(self._history) > self.max_history:
                self._history.pop(0)

        self._key_votes = len(self._history)
        
        # In transition state, require fewer votes (5 votes) to lock the climax tone faster.
        # In initial state, require base_min_votes (10 votes) for stability.
        current_min_votes = 5 if self.state == 2 else self.base_min_votes
        
        if self._key_votes < current_min_votes:
            return self.current_locked_key, self.current_locked_confidence

        scores: dict[str, float] = {}
        decay_factor = 0.94
        history_len = len(self._history)
        for i, (k, conf) in enumerate(self._history):
            weight = decay_factor ** (history_len - 1 - i)
            scores[k] = scores.get(k, 0.0) + conf * weight

        if not scores:
            return self.current_locked_key, self.current_locked_confidence

        total_score = sum(scores.values())
        main_key, main_score = max(scores.items(), key=lambda item: item[1])
        main_confidence = main_score / total_score if total_score > 0 else 0.0

        if self.state == 0:  # INIT -> LOCKED_INITIAL
            self.current_locked_key = main_key
            self.current_locked_confidence = main_confidence
            self.state = 1  # LOCKED_INITIAL
            self.emit({"type": "engine_log", "level": "info", "text": f"Initial key detected and locked: {main_key}"})
        elif self.state == 2:  # TRANSITION -> LOCKED_CLIMAX
            self.current_locked_key = main_key
            self.current_locked_confidence = main_confidence
            self.state = 3  # LOCKED_CLIMAX
            self.emit({"type": "engine_log", "level": "info", "text": f"Climax key detected and locked: {main_key}"})

        return self.current_locked_key, self.current_locked_confidence

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
                    
                    # Transition/Climax Detection (Sudden volume spike or key modulation)
                    chunk_rms = float(np.sqrt(np.mean(np.square(chunk))))
                    
                    has_modulated = False
                    if len(self._background_keys) >= 5:
                        first_bg = self._background_keys[0]
                        if all(k == first_bg for k in self._background_keys) and first_bg != self.current_locked_key:
                            has_modulated = True

                    if len(self._rms_history) >= 6:
                        avg_rms = sum(self._rms_history) / len(self._rms_history)
                        volume_spike = chunk_rms > 1.8 * avg_rms and chunk_rms > 0.015
                        
                        if (volume_spike or (has_modulated and chunk_rms > 0.012)) and self.state == 1:
                            self._history = []  # Flush voting history for a fresh start
                            self._background_keys = []
                            self.state = 2  # Set state to transition
                            self.emit({
                                "type": "analyzer_status",
                                "status": "transition",
                                "source": "WASAPI loopback",
                                "window_seconds": self.window_seconds,
                                "mode": self.mode,
                                "message": "Climax transition detected. Listening for new key."
                            })

                    self._rms_history.append(chunk_rms)
                    if len(self._rms_history) > 10:
                        self._rms_history.pop(0)

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
                    main_key, main_confidence = self._track_main_key(result.key, result.confidence)
                    self.emit(
                        {
                            "type": "tone",
                            "key": main_key,
                            "confidence": main_confidence,
                            "instant_key": result.key,
                            "instant_confidence": result.confidence,
                            "key_votes": self._key_votes,
                            "min_key_votes": 5 if self.state in (2, 3) else self.base_min_votes,
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
