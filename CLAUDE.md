# CLAUDE.md — VTT Labs

## What This Is

A bundle of standalone mini web apps for quickly testing Virtual Tabletop (VTT) features. These are demos/prototypes, not production code. The goal is fast iteration — no build steps, no frameworks, edit and refresh.

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
| **npc app** | NPC Visualizer | `packages/npc-visualizer/` | 3006 | `npm run npc` |
| **forge app** | NPC Forge | `packages/npc-forge/` | 3007 | `npm run forge` |
| **episode app** | Episode Planner | `packages/episode-planner/` | 3008 | `npm run episode` |

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
│   ├── dice-tray/
│   │   ├── server.js          # Static file server only, no API keys
│   │   └── public/index.html  # 3D dice roller using @drdreo/dice-box-threejs
│   ├── npc-visualizer/
│   │   ├── server.js          # Multi-model image gen proxy (OpenAI/xAI/Gemini), structured NPC trait builder
│   │   ├── public/index.html  # Character trait picker (7 groups, 20 categories), prompt builder, NPC gallery
│   │   └── .env               # OPENAI_API_KEY, XAI_API_KEY, GOOGLE_API_KEY go here
│   ├── npc-forge/
│       ├── server.js          # Multi-model image gen proxy, archetype system, tag-based trait builder
│       ├── public/index.html  # Tag-based character builder, archetypes, card export, compare mode
│   │   └── .env               # OPENAI_API_KEY, XAI_API_KEY, GOOGLE_API_KEY go here
│   └── episode-planner/
│       ├── server.js          # Series CRUD, folder/file tree, markdown read/write, multer imports
│       ├── public/index.html  # Home (series list) + editor view (sidebar tree + EasyMDE)
│       └── series/            # One subdir per series with real folders/files (gitignored)
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

### npc app
- Structured character builder: 20 trait categories across 7 groups (Identity, Physique, Face & Hair, Distinctive Features, Attire & Equipment, Expression & Pose, Presentation).
- 18 single-select dropdowns + 2 multi-select toggle grids (Distinctive Features, Accessories).
- Species "Custom" option reveals a freeform text input. Multi-select groups each have a "+ Add custom..." text input.
- Selections auto-assemble into a "Character Profile" textarea. Users can edit it directly (shows "customized" badge, purple border, reset button). Changing dropdowns after customizing triggers a confirmation dialog.
- All prompts prefixed with subject anchor (`1 person, solo, single subject, alone`) to keep output focused on a single NPC.
- Supports 3 image generation models: `gpt-image-1` (OpenAI), `grok-imagine-image` (xAI), `gemini-2.5-flash-image` (Google). Model selectable per request.
- Portrait orientation (1024x1536) for OpenAI model. Returns base64 images, saved to `generated/` dir.
- "Apply Prompt" on gallery images fully restores all selections, custom inputs, model/quality, and character profile state.
- API keys: `OPENAI_API_KEY`, `XAI_API_KEY`, `GOOGLE_API_KEY` — all in `.env`.

### forge app
- Multi-genre NPC character generator with tag-based UI instead of dropdowns.
- **8 genre modes:** Fantasy, Sci-Fi, Cyberpunk, Horror, Modern, Post-Apocalyptic, Steampunk, Western. Genre selector filters visible trait options and archetypes to genre-relevant choices. Genre context is prepended to the image prompt.
- **40+ archetype quick-start templates** across all genres (e.g. Fantasy: Warrior/Mage/Rogue; Cyberpunk: Street Samurai/Netrunner/Fixer; Horror: Investigator/Vampire/Cultist; Western: Gunslinger/Sheriff/Outlaw). Selecting an archetype auto-switches to its genre.
- 22 trait categories across 7 groups. Trait options tagged with `genres` array; universal options show in all genres, genre-specific ones only when that genre is active.
- Smart randomizer respects genre: picks genre-matching archetype, fills traits from genre-visible options only.
- Supports same 3 image generation models as npc app: `gpt-image-1`, `grok-imagine-image`, `gemini-2.5-flash-image`.
- Live prompt preview panel shows the full assembled prompt in real-time as traits are selected.
- Gallery with favorites system (persistent via JSON metadata files), filter by all/favorites.
- Fullscreen lightbox with arrow-key navigation and sidebar showing all trait details + full prompt + genre.
- "Apply Traits" restores all selections, genre, and model from a generated image. "Variation" applies traits then randomizes one for quick iteration.
- Character card export: renders a styled PNG card with image + trait grid using Canvas API.
- Side-by-side compare mode: select 2 gallery images to compare.
- Keyboard shortcuts: R (randomize), G (generate), Esc (close lightbox/compare), arrow keys (navigate lightbox).
- API keys: `OPENAI_API_KEY`, `XAI_API_KEY`, `GOOGLE_API_KEY` — all in `.env`.

### episode app
- Campaign planning tool. User calls campaigns "series". Two views: home (series list + create) and editor (sidebar tree + markdown editor).
- Series live as real directories under `packages/episode-planner/series/<slug>/`. Each has a `.series.json` with `{ name, system, created, lastOpened }` and starts with default `background/` and `episode-1/` subfolders.
- Game system is picked at creation time and is immutable. Allowed IDs: `agnostic`, `dnd5e-2014`, `dnd5e-2024`, `motw` (defined in `SYSTEMS` in `server.js`, exposed via `GET /api/systems`). Currently display-only; future hooks for per-system rules/templates.
- Display name and on-disk slug are independent — renaming a series only updates the JSON.
- Markdown editor: EasyMDE via CDN (split preview, toolbar). Cmd/Ctrl+S saves. Binary files (images, PDFs) show a preview/download instead of the editor.
- Sidebar tree supports nested folders, click-to-open, ✎ rename / ✕ delete buttons on hover. + Folder / + File / Import act on the currently selected folder (or selected file's parent).
- Imports use multer disk storage; files land directly in the target folder with their original (sanitized) name. 50MB per file.
- Every API endpoint that takes a `path` runs through `safeJoin()` to reject `..` traversal.
- No API keys required.

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

**Add a new forge trait option:** Edit the `TRAITS` object in `packages/npc-forge/server.js` — add entries to an existing category's `options` array (each needs `id`, `label`, `prompt`, and optionally `genres: ['fantasy', 'scifi']` to limit to specific genres). No frontend change needed — traits are fetched from `/api/traits`.

**Add a new forge archetype:** Add an entry to the `ARCHETYPES` array in `packages/npc-forge/server.js` with `id`, `label`, `icon`, `genre`, `description`, and `defaults` mapping trait keys to option IDs. No frontend change needed.

**Add a new forge genre:** Add an entry to the `GENRES` array in `packages/npc-forge/server.js` with `id`, `label`, `icon`, `description`, `promptPrefix`. Then add archetypes and genre-tagged trait options for it.

**Add a new NPC trait option:** Edit the `NPC_OPTIONS` object in `packages/npc-visualizer/server.js` — add entries to an existing category's `options` array, or add a new category with its `group`, `label`, `type`, and `options`. No frontend change needed — options are fetched from `/api/npc-options`.

**Debug audio issues:** Browser devtools → check `audioCtx.state` (must be `'running'`, not `'suspended'`). User interaction is required before Web Audio works.

## Gotchas

- Web Audio API requires a user gesture before `AudioContext` activates. If audio doesn't play, click something first.
- Daily.co free tier: 10,000 participant-minutes/month. Fine for testing.
- OpenAI image generation costs money per call. `quality: 'medium'` is set to keep costs down.
- xAI and Gemini image generation also cost money per call. Pick the cheaper model for bulk testing.
- localtunnel URLs can be flaky. If remote testing is unreliable, ngrok is more stable.
- All state is in-memory or on-disk. Restarting a server doesn't lose uploaded files but does lose any in-browser state.
