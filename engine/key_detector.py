import math
from dataclasses import dataclass

import numpy as np

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

STABLE_SCALE_INTERVALS = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
}


def _scale_profile(intervals: list[int]) -> np.ndarray:
    profile = np.full(12, 0.15, dtype=np.float64)
    for interval in intervals:
        profile[interval] = 1.0

    profile[0] = 1.45
    if 7 in intervals:
        profile[7] = 1.25
    if 3 in intervals:
        profile[3] = 1.15
    if 4 in intervals:
        profile[4] = 1.15

    return profile


SCALE_PROFILES = {
    name: _scale_profile(intervals) for name, intervals in STABLE_SCALE_INTERVALS.items()
}


@dataclass
class KeyResult:
    key: str
    confidence: float


def _correlation(a: np.ndarray, b: np.ndarray) -> float:
    a = a - np.mean(a)
    b = b - np.mean(b)
    denominator = np.linalg.norm(a) * np.linalg.norm(b)
    if denominator <= 1e-9:
        return 0.0
    return float(np.dot(a, b) / denominator)


def _normalized_entropy(values: np.ndarray) -> float:
    total = float(np.sum(values))
    if total <= 1e-9:
        return 0.0

    probabilities = values / total
    probabilities = probabilities[probabilities > 1e-12]
    return float(-np.sum(probabilities * np.log(probabilities)) / np.log(12.0))


def _fast_chroma(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    frame_size = 4096
    hop = 1024
    if samples.size < frame_size:
        samples = np.pad(samples, (0, frame_size - samples.size))

    window = np.hanning(frame_size).astype(np.float32)
    chroma_vector = np.zeros(12, dtype=np.float64)
    freqs = np.fft.rfftfreq(frame_size, d=1.0 / sample_rate)
    usable = (freqs >= 65.0) & (freqs <= 2093.0)
    usable_freqs = freqs[usable]
    pitch_classes = np.mod(np.rint(12.0 * np.log2(usable_freqs / 440.0) + 69.0), 12).astype(np.int32)

    frame_count = 0
    for start in range(0, max(1, samples.size - frame_size + 1), hop):
        frame = samples[start : start + frame_size]
        if frame.size < frame_size:
            frame = np.pad(frame, (0, frame_size - frame.size))

        spectrum = np.abs(np.fft.rfft(frame * window))
        magnitudes = spectrum[usable]
        np.add.at(chroma_vector, pitch_classes, magnitudes)
        frame_count += 1

    if frame_count == 0 or np.sum(chroma_vector) <= 1e-9:
        return chroma_vector

    return chroma_vector / np.sum(chroma_vector)


def _accurate_chroma(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    try:
        import librosa
    except ImportError as error:  # pragma: no cover - reported at runtime by the engine.
        raise RuntimeError("Missing dependency: librosa. Install Python requirements first.") from error

    chroma = librosa.feature.chroma_cqt(y=samples, sr=sample_rate)
    return np.mean(chroma, axis=1)


def detect_key(samples: np.ndarray, sample_rate: int, mode: str = "fast") -> KeyResult:
    if samples.ndim > 1:
        samples = np.mean(samples, axis=1)

    samples = np.asarray(samples, dtype=np.float32)
    if samples.size < sample_rate:
        return KeyResult("--", 0.0)

    rms = float(np.sqrt(np.mean(np.square(samples))))
    if not math.isfinite(rms) or rms < 0.003:
        return KeyResult("--", 0.0)

    chroma_vector = _accurate_chroma(samples, sample_rate) if mode == "accurate" else _fast_chroma(samples, sample_rate)

    scores = []
    for index, name in enumerate(PITCH_CLASSES):
        for scale_name, profile in SCALE_PROFILES.items():
            score = _correlation(chroma_vector, np.roll(profile, index))
            scores.append((score, f"{name} {scale_name}"))

    scores.sort(reverse=True, key=lambda item: item[0])
    best_score, best_key = scores[0]
    second_score = scores[1][0] if len(scores) > 1 else 0.0

    entropy = _normalized_entropy(chroma_vector)
    score_gap = best_score - second_score
    if entropy >= 0.965 and score_gap < 0.04:
        dominant_index = int(np.argmax(chroma_vector))
        return KeyResult(f"{PITCH_CLASSES[dominant_index]} chromatic", 0.55)

    confidence = max(0.0, min(1.0, (best_score - second_score + 0.25) / 0.5))

    return KeyResult(best_key, confidence)


def warmup_detector(sample_rate: int = 22050) -> None:
    noise = np.random.default_rng(0).normal(0, 0.01, sample_rate).astype(np.float32)
    detect_key(noise, sample_rate, "fast")
