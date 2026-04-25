# Audio Merger

A browser-based React app for trimming, previewing, fading, crossfading, mixing, and exporting audio tracks locally.

## Overview

This project lets you:

- Upload multiple audio files in the browser
- Trim each track with a crop window selector
- Reorder, duplicate, and remove tracks
- Preview individual trimmed tracks
- Add per-track fade in and fade out
- Merge tracks sequentially with optional crossfade
- Mix tracks in parallel as layers
- Export merged audio as lossless WAV
- Export merged audio as high-quality MP3 at 320 kbps

All processing happens client-side using the Web Audio API.

## Tech Stack

- React
- Vite
- Tailwind CSS
- Web Audio API
- lucide-react
- lamejs

## Getting Started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Then open the local URL shown by Vite, typically:

```bash
http://localhost:5173
```

### Production build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

## Project Structure

```text
audioeditor/
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vite.config.js
└── src/
    ├── App.jsx
    ├── index.css
    ├── main.jsx
    └── components/
        └── AudioMerger.jsx
```

## How It Works

1. Upload audio files.
2. Trim each track using the crop window or time inputs.
3. Optionally set fade in and fade out per track.
4. Choose one merge mode:
   - Sequential: plays tracks one after another with optional overlap
   - Mix / Layer: plays all tracks together
5. Set crossfade duration for sequential merges.
6. Merge and download the final output.

## Export Notes

- WAV export is lossless.
- MP3 export is not lossless. This app exports MP3 at 320 kbps, which is high quality but still lossy.
- If you need true lossless delivery, use WAV.

## Supported Audio Formats

Input support depends on the browser, but the app is set up to accept common formats such as:

- MP3
- WAV
- OGG
- M4A
- AAC
- FLAC
- WMA
- AIFF

## Can This Run On Vercel?

Yes. This project can be deployed to Vercel.

Why it works well on Vercel:

- It is a Vite frontend app
- The app builds to static assets
- Audio processing happens entirely in the browser
- No backend or server-side audio processing is required

### Vercel Deployment Steps

1. Push this project to GitHub.
2. Import the repository into Vercel.
3. Use the default Vite settings.
4. Build command:

```bash
npm run build
```

5. Output directory:

```bash
dist
```

### Notes for Vercel

- Large client-side dependencies like MP3 encoding increase bundle size.
- Browser support matters more than server runtime because processing happens on the client.
- If initial load performance becomes a concern, MP3 encoding can be lazy-loaded later.

## Limitations

- Processing large audio files can use significant browser memory.
- Supported input codecs depend on browser decoding support.
- MP3 encoding increases client bundle size.

## Future Improvements

Possible next improvements:

- FLAC export
- waveform visualization
- lazy-load MP3 encoder to reduce bundle size
- presets for fade and crossfade settings
- drag-and-drop uploads

## License

No license file is included currently.
