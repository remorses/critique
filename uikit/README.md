# Critique Diff Viewer - Three.js Version

A 3D diff viewer built with Three.js and @react-three/uikit to render code diffs in a 3D canvas.

## Features

- 3D rendering using Three.js and @react-three/fiber
- UI components from @react-three/uikit (Flex-based layout in 3D)
- Side-by-side diff view with syntax highlighting colors
- Interactive 3D scene with OrbitControls
- TypeScript support

## Setup

Install dependencies:

```bash
bun install
```

## Development

Run the development server:

```bash
bun run dev
```

Then open your browser to the URL shown in the terminal (usually http://localhost:5173).

## Commands

- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run preview` - Preview production build
- `bun run typecheck` - Run TypeScript type checking

## How it Works

The diff viewer uses:

1. **@react-three/fiber** - React renderer for Three.js
2. **@react-three/uikit** - Flexbox-based UI components that work in 3D
3. **diff** package - For generating structured diffs
4. **Three.js** - 3D rendering engine

The main component (`threejs.tsx`) creates a 3D canvas with:
- A `Root` container for the UI layout
- `Container` components for flexbox-based layout
- `Text` components for rendering text
- Color-coded backgrounds for additions (green) and removals (red)
- Line numbers for both old and new content

## File Structure

```
uikit/
├── src/
│   ├── index.tsx       # Entry point
│   └── threejs.tsx     # Main diff viewer component
├── index.html          # HTML template
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
├── vite.config.ts      # Vite bundler config
└── README.md           # This file
```

## Differences from OpenTUI Version

The OpenTUI version uses terminal-based rendering, while this version:
- Renders in a 3D WebGL canvas
- Uses flexbox layout in 3D space
- Has camera controls for navigation
- Uses CSS-like color codes instead of RGBA

## Controls

- **Left Mouse Drag** - Rotate camera
- **Right Mouse Drag** - Pan camera
- **Mouse Wheel** - Zoom in/out

## Customization

You can customize the diff viewer by modifying `src/threejs.tsx`:
- Change colors in the background properties
- Adjust font sizes in the fontSize properties
- Modify layout with flexDirection, gap, padding, etc.
- Change camera position and field of view
