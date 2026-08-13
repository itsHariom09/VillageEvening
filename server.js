/**
 * Sāndhya — Node/Express server
 * Serves the static site (HTML/CSS/JS + images/audio) from ./public.
 */

const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve everything in /public at the site root: /, /style.css, /app.js,
// /images/desktop-bg.jpg, /audio/music/song1.mp3, etc.
app.use(express.static(path.join(__dirname, 'public')));

// Explicit fallback for the root route (express.static already handles
// this via index.html, but this keeps intent clear and covers edge cases).
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Sāndhya is running → http://localhost:${PORT}`);
});
