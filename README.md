# VTT Labs — Quick Test Apps

Four standalone mini-apps for prototyping VTT features fast.

## Quick Start

```bash
npm install
```

Then run whichever app you need:

```bash
npm run ui       # :3001 — UI Theme Tester
npm run mixer    # :3002 — Audio Mixer/Playlist
npm run chat     # :3003 — Audio Chat (Daily.co)
npm run scene    # :3004 — Scene Visualizer (OpenAI)
```

## API Keys Required

**Audio Chat** — Get a free key at https://dashboard.daily.co/
```bash
echo "DAILY_API_KEY=your-key" > packages/audio-chat/.env
```

**Scene Visualizer** — Get a key at https://platform.openai.com/api-keys
```bash
echo "OPENAI_API_KEY=your-key" > packages/scene-visualizer/.env
```

## Apps

| App | Port | External Deps | Description |
|-----|------|--------------|-------------|
| UI Theme Tester | 3001 | None | Swap CSS themes on a VTT mockup layout. Drop new `.css` files in `themes/` |
| Audio Mixer | 3002 | None | Upload audio, mix multiple tracks, pan/volume, playlists |
| Audio Chat | 3003 | Daily.co API | Voice chat rooms. Runs on 0.0.0.0 for remote testing |
| Scene Visualizer | 3004 | OpenAI API | Pick a visual style, describe a scene, generate with AI |

## Adding Themes

Drop a CSS file in `packages/ui-theme-tester/themes/` defining these variables:

```css
:root {
  --bg-primary, --bg-secondary, --bg-panel, --bg-hover,
  --border, --border-accent,
  --text-primary, --text-secondary, --text-muted,
  --accent, --accent-hover, --accent-dim,
  --danger, --success,
  --radius, --font-body, --font-heading, --shadow
}
```

The theme picker auto-discovers new files.

## Deploying Audio Chat for Remote Testing

Easiest: ngrok tunnel
```bash
npm run chat
# In another terminal:
npx ngrok http 3003
```

Or deploy to any VPS — the server binds to `0.0.0.0`.
