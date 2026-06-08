# ToneLink (Cubase YouTube Tone Assistant) - Project Instructions

## Project Overview
ToneLink is an Electron application that integrates with Cubase and YouTube to provide real-time tone detection and MIDI remote control.

## Architecture
- **Main Process (`src/main`)**: Electron backend responsible for window management, configuration, and spawning the Python engine.
- **Renderer Process (`src/renderer`)**: React-based UI (Vite + TSX + TailwindCSS v4).
- **Python Engine (`engine`)**: Core audio analysis (librosa, soundcard) and MIDI communication (mido).

## Tech Stack
- **Frontend**: React 19, TypeScript, TailwindCSS 4, Lucide-React.
- **Backend**: Electron 31.
- **Engine**: Python 3.10/3.11, librosa, numpy, soundcard, mido.

## Development Workflows
- **Start Dev Mode**: `npm start` (starts Vite dev server and Electron).
- **Build Engine**: `npm run build:engine` (packages Python script into `.exe` using PyInstaller).
- **Cubase Integration**: Use `scripts/install-cubase-midi-remote.ps1` to install MIDI Remote scripts.

## Conventions
- **Code Style**: 
    - JavaScript/TypeScript: Follow existing ESM pattern in renderer and CommonJS in main.
    - Python: Use type hints and standard threading patterns for real-time processing.
- **Communication**:
    - Renderer to Main: IPC via `src/main/preload.js`.
    - Main to Engine: JSON objects over `stdin`/`stdout`.
- **MIDI**: Mappings are documented in `docs/stable-midi-mapping.md`. CC 30 is reserved for tone/transpose.

## Directory Structure
- `src/main`: Electron main process files.
- `src/renderer`: Vite root for the frontend.
    - `src/renderer/src/components`: React components.
- `engine`: Python source code for audio/MIDI.
- `scripts`: Build and installation scripts.
- `cubase_remote`: MIDI Remote script for Cubase.

## Subdirectory Instructions
- [src/renderer/GEMINI.md](./src/renderer/GEMINI.md) - React/UI specific guidance.
- [engine/GEMINI.md](./engine/GEMINI.md) - Python engine specific guidance.
