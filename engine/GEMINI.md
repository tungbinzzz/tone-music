# Engine - Python Analysis Instructions

## Overview
The engine is a standalone Python application (packaged as an `.exe` for production) that performs real-time audio analysis and handles MIDI communication with Cubase.

## Tech Stack
- **Python Version**: 3.10 or 3.11.
- **Audio Analysis**: `librosa` (CQT, Chroma), `numpy`.
- **Audio Capture**: `soundcard` (WASAPI loopback on Windows).
- **MIDI**: `mido` with `python-rtmidi` backend.

## Conventions
- **Communication Protocol**:
    - The engine reads JSON commands from `stdin`.
    - Every command should have an `id` and a `command` name.
    - The engine writes JSON responses and events to `stdout`.
- **Real-time Processing**:
    - Use `threading.Thread` for non-blocking audio capture and MIDI listening.
    - Use `threading.Event` for thread synchronization and stopping.
- **Error Handling**: Emit error events via `stdout` using a consistent JSON format: `{"type": "error", "message": "..."}`.
- **Type Hinting**: Use Python type hints for better code clarity and tool support.

## Key Modules
- `app.py`: Main entry point and JSON command handler.
- `audio_loopback.py`: Handles WASAPI loopback capture and the analysis loop.
- `key_detector.py`: Contains the logic for tone detection using Krumhansl-Schmuckler profiles.
- `cubase_midi.py`: MIDI utility functions for sending transport and CC messages.
