# Sāndhya — Cinematic Village Experience (Node app)

A full-screen, responsive site built around a background image, looping music, and an automatic ambient sound system — served by a small Express server. No frontend build step; the frontend is still plain HTML/CSS/JS.

```
project/
├── server.js          ← Express server (entry point)
├── package.json
└── public/             ← everything the browser loads, served as static files
    ├── index.html
    ├── style.css
    ├── app.js          ← runs the whole experience (player + ambient system)
    ├── images/
    │   ├── desktop-bg.jpg
    │   └── mobile-bg.jpg
    └── audio/
        ├── music/
        │   ├── song1.mp3
        │   ├── song2.mp3
        │   ├── song3.mp3
        │   └── song4.mp3
        └── ambience/
            ├── birds.mp3
            ├── wind.mp3
            ├── village.mp3
            ├── fire.mp3
            └── bell.mp3
```

## 1. Install dependencies

```bash
npm install
```

## 2. Add your assets

Drop your files straight into the matching `public/` subfolder — no path changes needed, `server.js` serves `public/` at the site root:

- `public/images/desktop-bg.jpg` — background above 767px
- `public/images/mobile-bg.jpg` — background at 767px and below
- `public/audio/music/song1.mp3` … `song4.mp3`
- `public/audio/ambience/birds.mp3`, `wind.mp3`, `village.mp3`, `fire.mp3`, `bell.mp3`

## 3. Run it

```bash
npm start
```

Then open **http://localhost:3000**.

For auto-restart on file changes during development:

```bash
npm run dev
```

Change the port with an environment variable if 3000 is taken:

```bash
PORT=4000 npm start
```

## 4. How to add a new song

Open `public/app.js` and add a line to the `songs` array near the top:

```js
const songs = [
  { name: 'Song 1', src: '/audio/music/song1.mp3' },
  { name: 'Song 5', src: '/audio/music/song5.mp3' } // new
];
```

The player list, next/previous behavior, and end-of-playlist logic all pick it up automatically.

## 5. How to add a new ambient sound

Add a line to the `ambientSounds` array in `public/app.js`:

```js
const ambientSounds = [
  { name: 'birds', src: '/audio/ambience/birds.mp3' },
  { name: 'rain', src: '/audio/ambience/rain.mp3' } // new
];
```

## 6. How to change ambient timing

In `public/app.js`, inside `CONFIG`:

```js
ambientIntervalRangeSec: [30, 60], // wait between 30–60s before the next ambient sound
ambientMaxPlaySec: 14,             // cap how long a clip plays before fading out
```

## 7. How to change music / ambient volume

Same `CONFIG` block in `public/app.js`:

```js
defaultMusicVolume: 0.70,   // 0–1
defaultAmbientVolume: 0.22, // 0–1
```

Visitors can also adjust both live from the player and the settings panel (gear icon, top-right); their choice is remembered via `localStorage`.

## 8. End-of-playlist behavior

```js
endOfPlaylistBehavior: 'loop', // or 'random'
```

`'loop'` restarts from the first song; `'random'` jumps to a random song other than the current one.

## Notes on behavior

- There is intentionally **no seek bar** — songs always start from the beginning and can only be changed via Previous / Next / the song list.
- The entry screen (the lamp) is required by the browser's autoplay policy: audio can only start after a real user gesture.
- If a song or ambient file is missing or fails to load, the site shows a small toast and — for music — automatically skips to the next track.
- Ambient sounds never overlap and never repeat back-to-back.
- `server.js` only serves static files — there's no database or API here, so deploying it is as simple as `npm install && npm start` on any Node host (Render, Railway, a VPS, etc.).
