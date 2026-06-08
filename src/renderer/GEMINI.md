# Renderer - Frontend Instructions

## Overview
The frontend is a React application built with Vite and TailwindCSS v4. It runs within Electron's renderer process.

## Tech Stack
- **Framework**: React 19 (Functional components, Hooks).
- **Styling**: TailwindCSS 4 (Utility-first, CSS variables).
- **Icons**: Lucide-React.
- **Build Tool**: Vite.

## Conventions
- **Components**: Located in `src/renderer/src/components`. Use `.tsx` extension.
- **State Management**: Use React Hooks (`useState`, `useEffect`, `useMemo`, `useCallback`).
- **Communication with Main**: Use the `window.nhacApp` bridge defined in `src/main/preload.js`.
- **Styling**: 
    - Avoid complex CSS files; prefer Tailwind utility classes.
    - Custom styles should go into `src/renderer/styles.css`.
- **Types**: Define interfaces for IPC payloads and engine events to maintain type safety.

## Key Files
- `index.html`: Main entry point.
- `src/main.tsx`: React entry point, handles view routing based on URL parameters.
- `src/components/tonelink-assistant.tsx`: Primary UI component for the main window.
