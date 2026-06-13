import json
import os
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass
from typing import Callable, Optional

import numpy as np

try:
    import soundcard as sc
except ImportError:  # pragma: no cover - reported at runtime by the engine.
    sc = None

from key_detector import detect_key


STATE_INIT = "INIT"
STATE_LOCKED_INITIAL = "LOCKED_INITIAL"
STATE_TRANSITION_ARMED = "TRANSITION_ARMED"
STATE_LOCKING_CLIMAX = "LOCKING_CLIMAX"
STATE_LOCKED_CLIMAX = "LOCKED_CLIMAX"

NOTE_INDEX = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


def _key_note_index(key_name: str) -> Optional[int]:
    if not key_name or key_name == "--":
        return None
    note = key_name.strip().split(maxsplit=1)[0]
    return NOTE_INDEX.get(note)


def _is_higher_key(candidate_key: str, locked_key: str) -> bool:
    candidate_index = _key_note_index(candidate_key)
    locked_index = _key_note_index(locked_key)
    if candidate_index is None or locked_index is None:
        return False
    return candidate_index > locked_index


def _resample_audio(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate or samples.size == 0:
        return samples

    source_frames = samples.shape[0]
    target_frames = max(1, int(round(source_frames * target_rate / source_rate)))
    source_positions = np.linspace(0.0, 1.0, source_frames, endpoint=False)
    target_positions = np.linspace(0.0, 1.0, target_frames, endpoint=False)

    if samples.ndim == 1:
        return np.interp(target_positions, source_positions, samples).astype(np.float32)

    channels = [
        np.interp(target_positions, source_positions, samples[:, channel])
        for channel in range(samples.shape[1])
    ]
    return np.stack(channels, axis=1).astype(np.float32)


@dataclass
class AudioFeatures:
    rms: float
    spectral_flux: float
    spectral_centroid: float
    high_ratio: float
    trend_score: float
    is_building: bool


class DebugTimeline:
    def __init__(self, filename: str = "debug-timeline.jsonl", max_events: int = 500):
        base_dir = os.environ.get("TONELINK_DEBUG_DIR")
        if not base_dir:
            base_dir = os.path.join(os.environ.get("LOCALAPPDATA", os.getcwd()), "ToneLink")
        self.path = os.path.join(base_dir, filename)
        self.max_events = max_events
        self.events: deque[dict] = deque(maxlen=max_events)
        self._lock = threading.Lock()
        try:
            os.makedirs(base_dir, exist_ok=True)
        except OSError:
            fallback_dir = os.getcwd()
            self.path = os.path.join(fallback_dir, filename)

    def append(self, event: dict) -> None:
        safe_event = {"timestamp": round(time.time(), 3), **event}
        with self._lock:
            self.events.append(safe_event)
            try:
                with open(self.path, "a", encoding="utf-8") as handle:
                    handle.write(json.dumps(safe_event, ensure_ascii=False) + "\n")
            except OSError:
                pass

    def tail(self, count: int = 25) -> list[dict]:
        with self._lock:
            return list(self.events)[-count:]


class FeatureTrend:
    def __init__(self, sample_rate: int, max_frames: int = 24):
        self.sample_rate = sample_rate
        self.max_frames = max_frames
        self._last_spectrum: Optional[np.ndarray] = None
        self._history: deque[AudioFeatures] = deque(maxlen=max_frames)

    def reset(self) -> None:
        self._last_spectrum = None
        self._history.clear()

    def update(self, samples: np.ndarray) -> AudioFeatures:
        mono = samples
        if mono.ndim > 1:
            mono = np.mean(mono, axis=1)
        mono = np.asarray(mono, dtype=np.float32)

        rms = float(np.sqrt(np.mean(np.square(mono)))) if mono.size else 0.0
        frame_size = 4096
        if mono.size < frame_size:
            frame = np.pad(mono, (0, frame_size - mono.size))
        else:
            frame = mono[-frame_size:]

        window = np.hanning(frame_size).astype(np.float32)
        spectrum = np.abs(np.fft.rfft(frame * window))
        spectrum_sum = float(np.sum(spectrum))
        if spectrum_sum <= 1e-9:
            normalized = np.zeros_like(spectrum)
            centroid = 0.0
            high_ratio = 0.0
        else:
            normalized = spectrum / spectrum_sum
            freqs = np.fft.rfftfreq(frame_size, d=1.0 / self.sample_rate)
            centroid = float(np.sum(freqs * normalized))
            high_ratio = float(np.sum(spectrum[freqs >= 2500.0]) / spectrum_sum)

        if self._last_spectrum is None:
            flux = 0.0
        else:
            flux = float(np.sqrt(np.mean(np.square(np.maximum(normalized - self._last_spectrum, 0.0)))))
        self._last_spectrum = normalized

        trend_score = self._score(rms, flux, centroid, high_ratio)
        features = AudioFeatures(
            rms=rms,
            spectral_flux=flux,
            spectral_centroid=centroid,
            high_ratio=high_ratio,
            trend_score=trend_score,
            is_building=trend_score >= 0.62,
        )
        self._history.append(features)
        return features

    def _score(self, rms: float, flux: float, centroid: float, high_ratio: float) -> float:
        if len(self._history) < 8:
            return 0.0

        old = list(self._history)[: max(3, len(self._history) // 2)]
        recent = list(self._history)[-max(3, len(self._history) // 3) :]

        def ratio(name: str, current: float) -> float:
            old_avg = float(np.mean([getattr(item, name) for item in old]))
            recent_avg = float(np.mean([getattr(item, name) for item in recent]))
            baseline = max(old_avg, 1e-6)
            return max(current, recent_avg) / baseline

        rms_score = min(1.0, max(0.0, (ratio("rms", rms) - 1.08) / 0.75))
        flux_score = min(1.0, max(0.0, (ratio("spectral_flux", flux) - 1.12) / 0.90))
        centroid_score = min(1.0, max(0.0, (ratio("spectral_centroid", centroid) - 1.04) / 0.45))
        high_score = min(1.0, max(0.0, (ratio("high_ratio", high_ratio) - 1.05) / 0.55))
        return (0.42 * rms_score) + (0.30 * flux_score) + (0.18 * centroid_score) + (0.10 * high_score)


class WeightedHysteresis:
    def __init__(self, max_frames: int = 36, decay: float = 0.93):
        self.max_frames = max_frames
        self.decay = decay
        self._history: deque[tuple[str, float, float]] = deque(maxlen=max_frames)

    def reset(self) -> None:
        self._history.clear()

    def add(self, key_name: str, confidence: float, strength: float) -> None:
        if key_name == "--" or "chromatic" in key_name:
            return
        score = max(confidence, strength)
        if score < 0.32:
            return
        self._history.append((key_name, confidence, strength))

    @property
    def votes(self) -> int:
        return len(self._history)

    def winner(self, excluded_key: str = "") -> tuple[str, float, float]:
        if not self._history:
            return "--", 0.0, 0.0

        scores: dict[str, float] = {}
        strengths: dict[str, list[float]] = {}
        history = list(self._history)
        for index, (key_name, confidence, strength) in enumerate(history):
            if excluded_key and key_name == excluded_key:
                continue
            age = len(history) - 1 - index
            weight = self.decay**age
            scores[key_name] = scores.get(key_name, 0.0) + max(confidence, strength) * weight
            strengths.setdefault(key_name, []).append(strength)

        total_score = sum(scores.values())
        if total_score <= 1e-9:
            return "--", 0.0, 0.0

        key_name, score = max(scores.items(), key=lambda item: item[1])
        return key_name, score / total_score, float(np.mean(strengths.get(key_name, [0.0])))

    def stable_count(self, key_name: str, min_score: float = 0.32) -> int:
        return sum(1 for key, confidence, strength in self._history if key == key_name and max(confidence, strength) >= min_score)


class MidiPolicy:
    def __init__(self):
        self.last_sent_key = ""

    def reset(self) -> None:
        self.last_sent_key = ""

    def decide(self, state: str, key_name: str, committed: bool) -> tuple[bool, str]:
        if not committed or key_name in ("", "--"):
            return False, "hold"
        if key_name == self.last_sent_key:
            return False, "dedupe"

        self.last_sent_key = key_name
        if state == STATE_LOCKED_INITIAL:
            return True, "send_initial_key"
        if state == STATE_LOCKED_CLIMAX:
            return True, "send_climax_key"
        return False, "hold"


class RealtimeAnalyzer:
    def __init__(
        self,
        emit: Callable[[dict], None],
        sample_rate: int = 22050,
        window_seconds: float = 4.0,
        hop_seconds: float = 0.5,
        mode: str = "essentia",
        min_main_key_votes: int = 12,
        vote_confidence_threshold: float = 0.35,
        min_transition_seconds_after_lock: float = 30.0,
        min_transition_build_frames: int = 4,
        min_transition_candidate_votes: int = 4,
        strong_transition_score_threshold: float = 0.78,
        late_transition_seconds_after_lock: float = 60.0,
        min_transition_progress_ratio: float = 0.75,
    ):
        self.emit = emit
        self.sample_rate = sample_rate
        self.window_seconds = window_seconds
        self.hop_seconds = hop_seconds
        self.mode = mode
        self.min_main_key_votes = min_main_key_votes
        self.vote_confidence_threshold = vote_confidence_threshold
        self.min_transition_seconds_after_lock = min_transition_seconds_after_lock
        self.min_transition_build_frames = min_transition_build_frames
        self.min_transition_candidate_votes = min_transition_candidate_votes
        self.strong_transition_score_threshold = strong_transition_score_threshold
        self.late_transition_seconds_after_lock = late_transition_seconds_after_lock
        self.min_transition_progress_ratio = min_transition_progress_ratio

        self.state = STATE_INIT
        self.current_locked_key = "--"
        self.current_locked_confidence = 0.0
        self.current_locked_strength = 0.0
        self._key_votes = 0
        self._initial_locked_at = 0.0
        self._transition_started_at = 0.0
        self._transition_build_streak = 0
        self._transition_candidate_key = "--"
        self._transition_candidate_votes = 0
        self._playback_current_time = 0.0
        self._playback_duration = 0.0
        self._playback_progress_ratio = 0.0
        self._playback_playing = False
        self._initial_lock = WeightedHysteresis(max_frames=36, decay=0.94)
        self._candidate_lock = WeightedHysteresis(max_frames=18, decay=0.90)
        self._features = FeatureTrend(sample_rate)
        self._midi_policy = MidiPolicy()
        self._debug = DebugTimeline()
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
        self.state = STATE_INIT
        self.current_locked_key = "--"
        self.current_locked_confidence = 0.0
        self.current_locked_strength = 0.0
        self._key_votes = 0
        self._initial_locked_at = 0.0
        self._transition_started_at = 0.0
        self._transition_build_streak = 0
        self._transition_candidate_key = "--"
        self._transition_candidate_votes = 0
        self._playback_current_time = 0.0
        self._playback_duration = 0.0
        self._playback_progress_ratio = 0.0
        self._playback_playing = False
        self._initial_lock.reset()
        self._candidate_lock.reset()
        self._features.reset()
        self._midi_policy.reset()

    def seed_initial_key(self, key_name: str, confidence: float = 1.0, strength: float = 1.0) -> None:
        safe_key = str(key_name or "").strip()
        if not safe_key or safe_key == "--":
            return
        self.state = STATE_LOCKED_INITIAL
        self.current_locked_key = safe_key
        self.current_locked_confidence = max(0.0, min(1.0, float(confidence or 1.0)))
        self.current_locked_strength = max(0.0, min(1.0, float(strength or 1.0)))
        self._key_votes = self.min_main_key_votes
        self._initial_locked_at = time.time() - self.min_transition_seconds_after_lock
        self._transition_started_at = 0.0
        self._transition_build_streak = 0
        self._transition_candidate_key = "--"
        self._transition_candidate_votes = 0
        self._initial_lock.reset()
        self._candidate_lock.reset()
        self._midi_policy.last_sent_key = safe_key
        self.emit({"type": "engine_log", "level": "info", "text": f"Seeded known initial key: {safe_key}"})

    def _commit_key(self, key_name: str, confidence: float, strength: float, state: str, reason: str) -> None:
        self.current_locked_key = key_name
        self.current_locked_confidence = confidence
        self.current_locked_strength = strength
        self.state = state
        if state == STATE_LOCKED_INITIAL:
            self._initial_locked_at = time.time()
        self.emit({"type": "engine_log", "level": "info", "text": f"{reason}: {key_name}"})

    def update_playback_position(self, current_time: float = 0.0, duration: float = 0.0, progress_ratio: float = 0.0, playing: bool = False) -> None:
        safe_current = max(0.0, float(current_time or 0.0))
        safe_duration = max(0.0, float(duration or 0.0))
        if safe_duration > 0.0:
            safe_ratio = safe_current / safe_duration
        else:
            safe_ratio = float(progress_ratio or 0.0)

        self._playback_current_time = safe_current
        self._playback_duration = safe_duration
        self._playback_progress_ratio = max(0.0, min(1.0, safe_ratio))
        self._playback_playing = bool(playing)

    def _has_song_position_for_transition(self, seconds_since_initial_lock: float) -> tuple[bool, str]:
        has_duration = self._playback_duration >= 30.0
        if has_duration:
            if self._playback_progress_ratio >= self.min_transition_progress_ratio:
                return True, "progress_ready"
            return False, "progress_too_early"

        if seconds_since_initial_lock >= self.late_transition_seconds_after_lock:
            return True, "time_fallback_ready"
        return False, "time_fallback_too_early"

    def _track_main_key(self, key_name: str, confidence: float, strength: float, features: AudioFeatures) -> tuple[str, float, bool, str]:
        committed = False
        transition_reason = ""

        if self.state == STATE_INIT:
            self._initial_lock.add(key_name, confidence, strength)
            self._key_votes = self._initial_lock.votes
            main_key, main_confidence, main_strength = self._initial_lock.winner()
            stable_count = self._initial_lock.stable_count(main_key)
            if stable_count >= self.min_main_key_votes and main_confidence >= 0.62 and main_strength >= self.vote_confidence_threshold:
                self._commit_key(main_key, main_confidence, main_strength, STATE_LOCKED_INITIAL, "Initial key detected and locked")
                self._key_votes = self.min_main_key_votes
                committed = True
            return self.current_locked_key, self.current_locked_confidence, committed, transition_reason

        if self.state == STATE_LOCKED_INITIAL:
            self._candidate_lock.add(key_name, confidence, strength)
            self._key_votes = self.min_main_key_votes
            candidate_key, candidate_confidence, candidate_strength = self._candidate_lock.winner(excluded_key=self.current_locked_key)
            candidate_votes = self._candidate_lock.stable_count(candidate_key)
            self._transition_candidate_key = candidate_key
            self._transition_candidate_votes = candidate_votes
            candidate_stable = candidate_votes >= self.min_transition_candidate_votes
            has_new_tonal_center = candidate_key != "--" and candidate_confidence >= 0.58 and candidate_strength >= self.vote_confidence_threshold
            seconds_since_initial_lock = time.time() - self._initial_locked_at if self._initial_locked_at else 0.0
            enough_song_time, position_reason = self._has_song_position_for_transition(seconds_since_initial_lock)
            late_song_time = seconds_since_initial_lock >= self.late_transition_seconds_after_lock

            if features.is_building:
                self._transition_build_streak += 1
            else:
                self._transition_build_streak = 0

            trend_ready = self._transition_build_streak >= self.min_transition_build_frames
            candidate_ready = has_new_tonal_center and candidate_stable
            strong_trend_ready = trend_ready and features.trend_score >= self.strong_transition_score_threshold
            late_candidate_ready = late_song_time and candidate_ready

            if enough_song_time and ((trend_ready and candidate_ready) or strong_trend_ready or late_candidate_ready):
                self.state = STATE_TRANSITION_ARMED
                self._transition_started_at = time.time()
                self._transition_build_streak = 0
                transition_reason = f"{position_reason}_trend_plus_key_candidate" if candidate_ready else f"{position_reason}_strong_trend"
                if late_candidate_ready and not trend_ready:
                    transition_reason = f"{position_reason}_late_key_candidate"
                self.emit(
                    {
                        "type": "analyzer_status",
                        "status": "transition_armed",
                        "source": "WASAPI loopback",
                        "window_seconds": self.window_seconds,
                        "mode": self.mode,
                        "message": "Late transition armed. Waiting for stable climax key.",
                    }
                )
            elif not enough_song_time and self._transition_build_streak >= self.min_transition_build_frames:
                transition_reason = position_reason
            return self.current_locked_key, self.current_locked_confidence, committed, transition_reason

        if self.state == STATE_TRANSITION_ARMED:
            self._candidate_lock.add(key_name, confidence, strength)
            self._key_votes = self._candidate_lock.votes
            if self._key_votes >= 3:
                self.state = STATE_LOCKING_CLIMAX
            return self.current_locked_key, self.current_locked_confidence, committed, "armed"

        if self.state == STATE_LOCKING_CLIMAX:
            self._candidate_lock.add(key_name, confidence, strength)
            self._key_votes = self._candidate_lock.votes
            candidate_key, candidate_confidence, candidate_strength = self._candidate_lock.winner(excluded_key=self.current_locked_key)
            stable_count = self._candidate_lock.stable_count(candidate_key)
            armed_for = time.time() - self._transition_started_at if self._transition_started_at else 0.0
            candidate_is_higher = _is_higher_key(candidate_key, self.current_locked_key)
            if (
                candidate_key != "--"
                and stable_count >= 5
                and candidate_confidence >= 0.62
                and candidate_strength >= self.vote_confidence_threshold
                and armed_for >= 2.0
                and candidate_is_higher
            ):
                self._commit_key(candidate_key, candidate_confidence, candidate_strength, STATE_LOCKED_CLIMAX, "Climax key detected and locked")
                self._key_votes = 5
                committed = True
                return self.current_locked_key, self.current_locked_confidence, committed, "locking_climax_higher_key_committed"
            if (
                candidate_key != "--"
                and stable_count >= 5
                and candidate_confidence >= 0.62
                and candidate_strength >= self.vote_confidence_threshold
                and armed_for >= 2.0
            ):
                return self.current_locked_key, self.current_locked_confidence, committed, "locking_climax_candidate_not_higher_hold_initial"
            return self.current_locked_key, self.current_locked_confidence, committed, "locking_climax"

        if self.state == STATE_LOCKED_CLIMAX:
            self._key_votes = 5
            return self.current_locked_key, self.current_locked_confidence, committed, "locked_climax"

        return self.current_locked_key, self.current_locked_confidence, committed, transition_reason

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None

    def _run(self) -> None:
        window_frames = int(self.sample_rate * self.window_seconds)
        chunks: list[np.ndarray] = []
        capture_rates = []
        for rate in (48000, 44100, self.sample_rate):
            if rate not in capture_rates:
                capture_rates.append(rate)

        try:
            speaker = sc.default_speaker()
            mic = sc.get_microphone(speaker.name, include_loopback=True)
            last_error: Exception | None = None
            for capture_rate in capture_rates:
                if self._stop.is_set():
                    return
                chunks = []
                chunk_frames = int(capture_rate * self.hop_seconds)
                try:
                    self.emit(
                        {
                            "type": "analyzer_status",
                            "status": "capturing",
                            "source": "WASAPI loopback",
                            "mode": self.mode,
                            "window_seconds": self.window_seconds,
                            "hop_seconds": self.hop_seconds,
                            "analysis_sample_rate": self.sample_rate,
                            "capture_sample_rate": capture_rate,
                            "debug_timeline": self._debug.path,
                        }
                    )
                    with mic.recorder(samplerate=capture_rate, channels=2, blocksize=chunk_frames) as recorder:
                        while not self._stop.is_set():
                            capture_started = time.time()
                            raw_chunk = np.asarray(recorder.record(numframes=chunk_frames))
                            chunk = _resample_audio(raw_chunk, capture_rate, self.sample_rate)
                            capture_ms = int((time.time() - capture_started) * 1000)
                            features = self._features.update(chunk)

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
                            main_key, main_confidence, committed, transition_reason = self._track_main_key(
                                result.key,
                                result.confidence,
                                result.strength,
                                features,
                            )
                            midi_should_send, midi_action = self._midi_policy.decide(self.state, main_key, committed)
                            analysis_ms = int((time.time() - started) * 1000)
                            min_votes = 5 if self.state in (STATE_TRANSITION_ARMED, STATE_LOCKING_CLIMAX, STATE_LOCKED_CLIMAX) else self.min_main_key_votes

                            debug_event = {
                                "state": self.state,
                                "locked_key": main_key,
                                "instant_key": result.key,
                                "instant_confidence": round(result.confidence, 4),
                                "instant_strength": round(result.strength, 4),
                                "detector_source": result.source,
                                "key_votes": self._key_votes,
                                "min_key_votes": min_votes,
                                "features": {key: round(value, 6) if isinstance(value, float) else value for key, value in asdict(features).items()},
                                "seconds_since_initial_lock": round(time.time() - self._initial_locked_at, 3) if self._initial_locked_at else 0.0,
                                "transition_build_streak": self._transition_build_streak,
                                "transition_candidate_key": self._transition_candidate_key,
                                "transition_candidate_votes": self._transition_candidate_votes,
                                "transition_candidate_is_higher": _is_higher_key(self._transition_candidate_key, main_key),
                                "playback_current_time": round(self._playback_current_time, 3),
                                "playback_duration": round(self._playback_duration, 3),
                                "playback_progress_ratio": round(self._playback_progress_ratio, 4),
                                "playback_playing": self._playback_playing,
                                "analysis_sample_rate": self.sample_rate,
                                "capture_sample_rate": capture_rate,
                                "min_transition_seconds_after_lock": self.min_transition_seconds_after_lock,
                                "min_transition_progress_ratio": self.min_transition_progress_ratio,
                                "min_transition_build_frames": self.min_transition_build_frames,
                                "min_transition_candidate_votes": self.min_transition_candidate_votes,
                                "strong_transition_score_threshold": self.strong_transition_score_threshold,
                                "late_transition_seconds_after_lock": self.late_transition_seconds_after_lock,
                                "transition_reason": transition_reason,
                                "midi_action": midi_action,
                                "midi_should_send": midi_should_send,
                            }
                            self._debug.append(debug_event)

                            self.emit(
                                {
                                    "type": "tone",
                                    "key": main_key,
                                    "confidence": main_confidence,
                                    "strength": self.current_locked_strength,
                                    "instant_key": result.key,
                                    "instant_confidence": result.confidence,
                                    "instant_strength": result.strength,
                                    "detector_source": result.source,
                                    "key_votes": self._key_votes,
                                    "min_key_votes": min_votes,
                                    "state": self.state,
                                    "transition_score": features.trend_score,
                                    "seconds_since_initial_lock": round(time.time() - self._initial_locked_at, 3) if self._initial_locked_at else 0.0,
                                    "transition_build_streak": self._transition_build_streak,
                                    "transition_candidate_key": self._transition_candidate_key,
                                    "transition_candidate_votes": self._transition_candidate_votes,
                                    "transition_candidate_is_higher": _is_higher_key(self._transition_candidate_key, main_key),
                                    "playback_current_time": round(self._playback_current_time, 3),
                                    "playback_duration": round(self._playback_duration, 3),
                                    "playback_progress_ratio": round(self._playback_progress_ratio, 4),
                                    "is_building": features.is_building,
                                    "midi_should_send": midi_should_send,
                                    "midi_action": midi_action,
                                    "debug_timeline": self._debug.path,
                                    "debug_tail": self._debug.tail(10),
                                    "source": "WASAPI loopback",
                                    "capture_ms": capture_ms,
                                    "analysis_ms": analysis_ms,
                                    "window_seconds": round(samples.shape[0] / self.sample_rate, 2),
                                    "hop_seconds": self.hop_seconds,
                                    "mode": self.mode,
                                }
                            )
                        return
                except Exception as error:
                    last_error = error
                    self.emit(
                        {
                            "type": "analyzer_status",
                            "status": "capture_retry",
                            "source": "WASAPI loopback",
                            "capture_sample_rate": capture_rate,
                            "message": f"Capture failed at {capture_rate} Hz: {error}",
                        }
                    )
                    continue
            if last_error is not None:
                self.emit({"type": "error", "message": f"Audio capture failed for all sample rates: {last_error}"})
        except Exception as error:
            self.emit({"type": "error", "message": str(error)})
