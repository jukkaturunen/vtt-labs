# CLAUDE.md — VTT Labs

## What This Is

A bundle of five standalone mini web apps for quickly testing Virtual Tabletop (VTT) features. These are demos/prototypes, not production code. The goal is fast iteration — no build steps, no frameworks, edit and refresh.

All apps are vanilla JS + Express. Each frontend is a single `public/index.html` with inline CSS and JS.

## App Names & Conventions

Use these short names when referring to apps:

| Short name | Full name | Dir | Port | Run |
|---|---|---|---|---|
| **ui app** | UI Theme Tester | `packages/ui-theme-tester/` | 3001 | `npm run ui` |
| **mixer app** | Audio Mixer/Playlist | `packages/audio-mixer/` | 3002 | `npm run mixer` |
| **chat app** | Audio Chat | `packages/audio-chat/` | 3003 | `npm run chat` |
| **scene app** | Scene Visualizer | `packages/scene-visualizer/` | 3004 | `npm run scene` |
| **dice app** | Dice Tray | `packages/dice-tray/` | 3005 | `npm run dice` |

## Directory Structure

```
vtt-labs/
├── package.json              # npm workspaces root, run scripts
├── shared/
│   ├── package.json
│   └── server.js             # Express app factory (currently unused, available for extraction)
├── packages/
│   ├── ui-theme-tester/
│   │   ├── server.js          # Serves static + theme file discovery API
│   │   ├── public/index.html  # Full VTT layout mockup with theme switching
│   │   └── themes/            # Drop .css files here, auto-discovered
│   │       ├── dark-fantasy.css
│   │       ├── clean-modern.css
│   │       └── cyberpunk-neon.css
│   ├── audio-mixer/
│   │   ├── server.js          # File upload/listing API (multer)
│   │   └── public/index.html  # Web Audio API mixer: channels, volume, pan, playlists
│   ├── audio-chat/
│   │   ├── server.js          # Daily.co room/token proxy (keeps API key server-side)
│   │   ├── public/index.html  # Daily.co JS SDK, audio-only call UI
│   │   └── .env               # DAILY_API_KEY goes here
│   ├── scene-visualizer/
│   │   ├── server.js          # OpenAI gpt-image-1 proxy, style presets, ref image uploads
│   │   ├── public/index.html  # Style picker, prompt input, gallery
│   │   └── .env               # OPENAI_API_KEY goes here
│   └── dice-tray/
│       ├── server.js          # Static file server only, no API keys
│       └── public/index.html  # 3D dice roller using @drdreo/dice-box-threejs
```

## Architecture Notes

- **No build step.** Every frontend is one HTML file. Edit → refresh.
- **Each app is independent.** They share nothing at runtime. You can run one without the others.
- **npm workspaces** only used for convenience (`npm run ui` from root). Each package has its own deps.
- **API keys** are in `.env` files inside each package that needs them. Never committed to git.
- **File uploads** go to `uploads/` dirs inside each package. Generated images go to `generated/`. Both are gitignored.

## Key Technical Details Per App

### ui app
- Themes are pure CSS custom property files in `themes/`. The server scans this dir on request.
- The HTML shows a representative VTT layout: left sidebar (scenes, players), center canvas, right panel (chat), bottom bar.
- All UI elements read from CSS vars: `--bg-primary`, `--accent`, `--font-body`, `--radius`, etc.
- Adding a theme = dropping a `.css` file. No restart needed.

### mixer app
- Uses Web Audio API: `AudioContext`, `MediaElementSource`, `GainNode`, `StereoPannerNode`.
- Each channel is an independent audio element routed through gain → pan → master gain.
- Playlist is sequential playback (plays next track on `ended` event).
- File upload via multer, stored on disk. Max 50MB per file.

### chat app
- Uses Daily.co JS SDK loaded from CDN (`@daily-co/daily-js`).
- Server proxies room creation and token generation to keep API key server-side.
- Audio-only (video disabled). Binds to `0.0.0.0` for remote access.
- For remote testing: `npx localtunnel --port 3003` (no signup) or `npx ngrok http 3003` (needs free account).

### scene app
- Style presets are defined in `server.js` as objects with `prompt_prefix` strings that prepend to user prompts.
- Players pick a style (e.g. "Cinematic Fantasy"), write a scene description, and the server concatenates them before calling OpenAI.
- Uses `gpt-image-1` model, returns base64, saved to `generated/` dir.
- Reference image upload exists but is not yet wired into generation (future: img2img).

### dice app
- Uses `@drdreo/dice-box-threejs` (Three.js + Cannon-ES) loaded from CDN. No npm install needed for the 3D engine.
- All assets (textures, sounds) served from jsDelivr CDN.
- Supports all standard RPG dice: d4, d6, d8, d10, d12, d20, d100.
- Predetermined rolling via `@` notation (e.g. `2d6@4,3`) — enables replay of rolls on remote clients.
- `roll()` returns structured results: notation, individual die values, totals, modifier.
- Roll history stored in-memory. Clicking a history entry replays that roll with forced values.
- Customizable surface (felt/wood/metal), dice color, and material via dropdowns.

## Common Tasks

**Add a new theme:** Create `packages/ui-theme-tester/themes/my-theme.css` defining all `--` vars. Refresh browser.

**Add a new style preset:** Edit `STYLE_PRESETS` array in `packages/scene-visualizer/server.js`. No frontend change needed — styles are fetched from API.

**Change image model or size:** Edit the `openai.images.generate()` call in scene app's `server.js`.

**Debug audio issues:** Browser devtools → check `audioCtx.state` (must be `'running'`, not `'suspended'`). User interaction is required before Web Audio works.

## Gotchas

- Web Audio API requires a user gesture before `AudioContext` activates. If audio doesn't play, click something first.
- Daily.co free tier: 10,000 participant-minutes/month. Fine for testing.
- OpenAI image generation costs money per call. `quality: 'medium'` is set to keep costs down.
- localtunnel URLs can be flaky. If remote testing is unreliable, ngrok is more stable.
- All state is in-memory or on-disk. Restarting a server doesn't lose uploaded files but does lose any in-browser state.
