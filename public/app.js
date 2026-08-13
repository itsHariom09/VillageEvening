/* ==========================================================================
   Sāndhya — app.js
   Modular vanilla JS: entry gate, custom music player (no seeking),
   and an automatic ambient sound system with fades and random spacing.
   ========================================================================== */

(() => {
  'use strict';

  /* ----------------------------------------------------------------------
     1. CONFIGURATION — everything you're likely to want to tweak lives here
     ---------------------------------------------------------------------- */

  // The main soundtrack. Add/remove entries freely; the player adapts.
  const songs = [
    { name: 'Song 1', src: '/audio/music/01.mp3' },
    { name: 'Song 2', src: '/audio/music/02.mp3' },
    { name: 'Song 3', src: '/audio/music/03.mp3' },
    { name: 'Song 4', src: '/audio/music/04.mp3' },
    { name: 'Song 5', src: '/audio/music/05.mp3' }
  ];

  // Ambient / environmental one-shots, triggered automatically.
  const ambientSounds = [
    { name: 'birds', src: '/audio/ambience/01.mp3' },
    { name: 'birds1', src: '/audio/ambience/02.mp3' },
    { name: 'birds2', src: '/audio/ambience/03.mp3' }
  ];

  const CONFIG = {
    // What happens after the last song finishes: 'loop' (back to song 1) or 'random'.
    endOfPlaylistBehavior: 'loop',

    // Default volumes (0–1). Mirrored by the settings sliders.
    defaultMusicVolume: 0.70,
    defaultAmbientVolume: 0.22,

    // How long fades take, in milliseconds.
    musicFadeMs: 900,
    ambientFadeInMs: 2500,
    ambientFadeOutMs: 3000,

    // Random gap between ambient sounds, in seconds [min, max].
    // Feel free to change this to e.g. [45, 90] or [60, 120].
    ambientIntervalRangeSec: [30, 60],

    // Ambient sounds are capped in duration so they stay "one-shot"-ish even
    // if the source file is long; set to null to let a clip play in full.
    ambientMaxPlaySec: 14,

    fadeStepMs: 40 // granularity of the fade interval loop
  };

  /* ----------------------------------------------------------------------
     2. STATE
     ---------------------------------------------------------------------- */

  const state = {
    currentSongIndex: 0,
    isPlaying: false,
    isMuted: false,
    musicVolume: CONFIG.defaultMusicVolume,
    ambientVolume: CONFIG.defaultAmbientVolume,
    ambientEnabled: true,
    lastAmbientIndex: -1,
    ambientTimerId: null,
    ambientPlaying: false,
    hasEntered: false
  };

  // Reused audio elements (never spawn unlimited Audio objects).
  const musicAudio = new Audio();
  musicAudio.preload = 'auto';
  musicAudio.setAttribute('playsinline', ''); // iOS inline playback

  const ambientAudio = new Audio();
  ambientAudio.preload = 'none';
  ambientAudio.setAttribute('playsinline', '');

  let musicFadeInterval = null;
  let ambientFadeInterval = null;
  let ambientStopTimeout = null;

  /* ----------------------------------------------------------------------
     3. DOM REFERENCES
     ---------------------------------------------------------------------- */

  const els = {
    entryOverlay: document.getElementById('entry-overlay'),
    enterBtn: document.getElementById('enter-btn'),
    experience: document.getElementById('experience'),

    songName: document.getElementById('song-name'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),

    muteBtn: document.getElementById('mute-btn'),
    iconVolOn: document.getElementById('icon-vol-on'),
    iconVolOff: document.getElementById('icon-vol-off'),
    musicVolumeSlider: document.getElementById('music-volume'),

    playlistToggle: document.getElementById('playlist-toggle'),
    playlist: document.getElementById('playlist'),

    settingsToggle: document.getElementById('settings-toggle'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsClose: document.getElementById('settings-close'),
    musicVolumeSetting: document.getElementById('music-volume-setting'),
    musicVolVal: document.getElementById('music-vol-val'),
    ambientVolumeSetting: document.getElementById('ambient-volume-setting'),
    ambientVolVal: document.getElementById('ambient-vol-val'),
    ambientToggle: document.getElementById('ambient-toggle'),

    toast: document.getElementById('toast')
  };

  /* ----------------------------------------------------------------------
     4. UTILITIES
     ---------------------------------------------------------------------- */

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function showToast(message, duration = 3200) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      els.toast.classList.remove('show');
    }, duration);
  }

  function saveSettings() {
    try {
      localStorage.setItem('sandhya:settings', JSON.stringify({
        musicVolume: state.musicVolume,
        ambientVolume: state.ambientVolume,
        ambientEnabled: state.ambientEnabled,
        currentSongIndex: state.currentSongIndex,
        hasEntered: true
      }));
    } catch (e) {
      /* localStorage unavailable — experience still works, just won't persist */
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem('sandhya:settings');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.musicVolume === 'number') state.musicVolume = saved.musicVolume;
      if (typeof saved.ambientVolume === 'number') state.ambientVolume = saved.ambientVolume;
      if (typeof saved.ambientEnabled === 'boolean') state.ambientEnabled = saved.ambientEnabled;
      if (typeof saved.currentSongIndex === 'number' && songs[saved.currentSongIndex]) {
        state.currentSongIndex = saved.currentSongIndex;
      }
      state.hasEntered = !!saved.hasEntered;
    } catch (e) {
      /* ignore malformed storage */
    }
  }

  /* ----------------------------------------------------------------------
     5. FADE HELPERS
     ---------------------------------------------------------------------- */

  function fadeInAudio(audio, targetVolume, durationMs) {
    return new Promise((resolve) => {
      clearInterval(audio === musicAudio ? musicFadeInterval : ambientFadeInterval);
      const steps = Math.max(1, Math.round(durationMs / CONFIG.fadeStepMs));
      const startVolume = audio.volume;
      let step = 0;

      const interval = setInterval(() => {
        step += 1;
        const progress = step / steps;
        audio.volume = clamp01(startVolume + (targetVolume - startVolume) * progress);
        if (step >= steps) {
          clearInterval(interval);
          audio.volume = clamp01(targetVolume);
          resolve();
        }
      }, CONFIG.fadeStepMs);

      if (audio === musicAudio) musicFadeInterval = interval;
      else ambientFadeInterval = interval;
    });
  }

  function fadeOutAudio(audio, durationMs, thenPause = true) {
    return new Promise((resolve) => {
      clearInterval(audio === musicAudio ? musicFadeInterval : ambientFadeInterval);
      const steps = Math.max(1, Math.round(durationMs / CONFIG.fadeStepMs));
      const startVolume = audio.volume;
      let step = 0;

      const interval = setInterval(() => {
        step += 1;
        const progress = step / steps;
        audio.volume = clamp01(startVolume * (1 - progress));
        if (step >= steps) {
          clearInterval(interval);
          audio.volume = 0;
          if (thenPause) audio.pause();
          resolve();
        }
      }, CONFIG.fadeStepMs);

      if (audio === musicAudio) musicFadeInterval = interval;
      else ambientFadeInterval = interval;
    });
  }

  /* ----------------------------------------------------------------------
     6. MUSIC PLAYER
     ---------------------------------------------------------------------- */

  function renderPlaylist() {
    els.playlist.innerHTML = '';
    songs.forEach((song, index) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = song.name;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(index === state.currentSongIndex));
      btn.addEventListener('click', () => {
        changeSong(index);
        els.playlist.hidden = true;
        els.playlistToggle.setAttribute('aria-expanded', 'false');
      });

      li.appendChild(btn);
      els.playlist.appendChild(li);
    });
  }

  function updatePlaylistSelection() {
    els.playlist.querySelectorAll('button').forEach((btn, index) => {
      btn.setAttribute('aria-selected', String(index === state.currentSongIndex));
    });
  }

  function updatePlayPauseUI() {
  const playing = state.isPlaying;

  els.iconPause.classList.toggle('icon-hidden', !playing);
  els.iconPlay.classList.toggle('icon-hidden', playing);

  els.playPauseBtn.setAttribute(
    'aria-label',
    playing ? 'Pause music' : 'Play music'
  );
}

  function loadSong(index, autoplay) {
    const song = songs[index];
    if (!song) return;
    state.currentSongIndex = index;
    els.songName.textContent = song.name;
    musicAudio.src = song.src;
    musicAudio.load();
    updatePlaylistSelection();
    saveSettings();

    if (autoplay) {
      musicAudio.volume = 0;
      musicAudio.play().then(() => {
        state.isPlaying = true;
        updatePlayPauseUI();
        fadeInAudio(musicAudio, state.isMuted ? 0 : state.musicVolume, CONFIG.musicFadeMs);
      }).catch(() => {
        // Autoplay was blocked or the file failed — surface it quietly.
        showToast('Unable to play this song. Trying another track…');
        playNextSong();
      });
    }
  }

  function playMusic() {
    if (!musicAudio.src) {
      loadSong(state.currentSongIndex, true);
      return;
    }
    musicAudio.play().then(() => {
      state.isPlaying = true;
      updatePlayPauseUI();
      fadeInAudio(musicAudio, state.isMuted ? 0 : state.musicVolume, CONFIG.musicFadeMs);
    }).catch(() => {
      showToast('Playback was blocked by the browser.');
    });
  }

  function pauseMusic() {
  state.isPlaying = false;
  updatePlayPauseUI();

  fadeOutAudio(
    musicAudio,
    CONFIG.musicFadeMs / 2,
    true
  );
}

  function togglePlayPause() {
    if (state.isPlaying) pauseMusic();
    else playMusic();
  }

  function changeSong(index) {
    const wrapped = ((index % songs.length) + songs.length) % songs.length;
    loadSong(wrapped, true);
  }

  function playNextSong() {
    let nextIndex;
    if (state.currentSongIndex === songs.length - 1 && CONFIG.endOfPlaylistBehavior === 'random') {
      // pick any song other than the current one, if possible
      do {
        nextIndex = Math.floor(Math.random() * songs.length);
      } while (nextIndex === state.currentSongIndex && songs.length > 1);
    } else {
      nextIndex = (state.currentSongIndex + 1) % songs.length;
    }
    changeSong(nextIndex);
  }

  function playPreviousSong() {
    const prevIndex = (state.currentSongIndex - 1 + songs.length) % songs.length;
    changeSong(prevIndex);
  }

  function setMusicVolume(value01) {
    state.musicVolume = clamp01(value01);
    if (!state.isMuted) musicAudio.volume = state.musicVolume;
    els.musicVolumeSlider.value = String(Math.round(state.musicVolume * 100));
    els.musicVolumeSetting.value = String(Math.round(state.musicVolume * 100));
    els.musicVolVal.textContent = `${Math.round(state.musicVolume * 100)}%`;
    saveSettings();
  }

  function toggleMute() {
  state.isMuted = !state.isMuted;

  musicAudio.volume = state.isMuted ? 0 : state.musicVolume;

  els.iconVolOn.classList.toggle('icon-hidden', state.isMuted);
  els.iconVolOff.classList.toggle('icon-hidden', !state.isMuted);

  els.muteBtn.setAttribute(
    'aria-label',
    state.isMuted ? 'Unmute music' : 'Mute music'
  );
}

  // Errors on the shared <audio> element (bad path, unsupported format, etc.)
  musicAudio.addEventListener('error', () => {
    if (!state.hasEntered) return; // ignore pre-interaction probing
    showToast('Unable to play this song. Trying another track…');
    playNextSong();
  });

  musicAudio.addEventListener('ended', () => {
    playNextSong();
  });

  /* ----------------------------------------------------------------------
     7. AMBIENT SOUND SYSTEM
     ---------------------------------------------------------------------- */

  function pickNextAmbient() {
    if (ambientSounds.length === 1) return 0;
    let index;
    do {
      index = Math.floor(Math.random() * ambientSounds.length);
    } while (index === state.lastAmbientIndex);
    return index;
  }

  function playRandomAmbient() {
    if (!state.ambientEnabled || state.ambientPlaying) return scheduleNextAmbient();

    const index = pickNextAmbient();
    state.lastAmbientIndex = index;
    const clip = ambientSounds[index];

    ambientAudio.src = clip.src;
    ambientAudio.volume = 0;
    state.ambientPlaying = true;

    ambientAudio.play().then(() => {
      fadeInAudio(ambientAudio, state.ambientVolume, CONFIG.ambientFadeInMs);

      const capMs = CONFIG.ambientMaxPlaySec ? CONFIG.ambientMaxPlaySec * 1000 : null;
      const endHandler = () => finishAmbient();

      ambientAudio.addEventListener('ended', endHandler, { once: true });

      if (capMs) {
        clearTimeout(ambientStopTimeout);
        ambientStopTimeout = setTimeout(() => {
          ambientAudio.removeEventListener('ended', endHandler);
          finishAmbient();
        }, capMs);
      }
    }).catch(() => {
      // A missing/blocked ambient file shouldn't disturb the experience.
      state.ambientPlaying = false;
      scheduleNextAmbient();
    });
  }

  function finishAmbient() {
    fadeOutAudio(ambientAudio, CONFIG.ambientFadeOutMs, true).then(() => {
      state.ambientPlaying = false;
      scheduleNextAmbient();
    });
  }

  function scheduleNextAmbient() {
    clearTimeout(state.ambientTimerId);
    if (!state.ambientEnabled) return;
    const [min, max] = CONFIG.ambientIntervalRangeSec;
    const waitMs = randomBetween(min, max) * 1000;
    state.ambientTimerId = setTimeout(playRandomAmbient, waitMs);
  }

  function startAmbientSystem() {
    if (!state.ambientEnabled) return;
    scheduleNextAmbient();
  }

  function stopAmbientSystem() {
    clearTimeout(state.ambientTimerId);
    clearTimeout(ambientStopTimeout);
    state.ambientTimerId = null;
    if (state.ambientPlaying) {
      fadeOutAudio(ambientAudio, CONFIG.ambientFadeOutMs / 2, true);
      state.ambientPlaying = false;
    }
  }

  function setAmbientVolume(value01) {
    state.ambientVolume = clamp01(value01);
    if (state.ambientPlaying) ambientAudio.volume = state.ambientVolume;
    els.ambientVolumeSetting.value = String(Math.round(state.ambientVolume * 100));
    els.ambientVolVal.textContent = `${Math.round(state.ambientVolume * 100)}%`;
    saveSettings();
  }

  function setAmbientEnabled(enabled) {
    state.ambientEnabled = enabled;
    els.ambientToggle.setAttribute('aria-checked', String(enabled));
    if (enabled) {
      startAmbientSystem();
    } else {
      stopAmbientSystem();
    }
    saveSettings();
  }

  /* ----------------------------------------------------------------------
     8. ENTRY / INITIALIZATION
     ---------------------------------------------------------------------- */

  function initializeExperience() {
    state.hasEntered = true;

    // Hide entry screen
    els.entryOverlay.classList.add('hidden');
    els.entryOverlay.setAttribute('aria-hidden', 'true');

    // Show main experience
    els.experience.removeAttribute('aria-hidden');

    // Start music
    loadSong(state.currentSongIndex, true);

    // Start ambient sounds
    startAmbientSystem();

    saveSettings();
}

  /* ----------------------------------------------------------------------
     9. EVENT WIRING
     ---------------------------------------------------------------------- */

  function wireEvents() {
    els.enterBtn.addEventListener('click', initializeExperience);
    els.enterBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        initializeExperience();
      }
    });

    els.playPauseBtn.addEventListener('click', togglePlayPause);
    els.prevBtn.addEventListener('click', playPreviousSong);
    els.nextBtn.addEventListener('click', playNextSong);
    els.muteBtn.addEventListener('click', toggleMute);

    els.musicVolumeSlider.addEventListener('input', (e) => {
      setMusicVolume(Number(e.target.value) / 100);
      if (state.isMuted && Number(e.target.value) > 0) toggleMute();
    });

    els.playlistToggle.addEventListener('click', () => {
      const willShow = els.playlist.hidden;
      els.playlist.hidden = !willShow;
      els.playlistToggle.setAttribute('aria-expanded', String(willShow));
    });

    els.settingsToggle.addEventListener('click', () => {
      const willShow = els.settingsPanel.hidden;
      els.settingsPanel.hidden = !willShow;
      els.settingsToggle.setAttribute('aria-expanded', String(willShow));
    });
    els.settingsClose.addEventListener('click', () => {
      els.settingsPanel.hidden = true;
      els.settingsToggle.setAttribute('aria-expanded', 'false');
      els.settingsToggle.focus();
    });

    els.musicVolumeSetting.addEventListener('input', (e) => {
      setMusicVolume(Number(e.target.value) / 100);
    });
    els.ambientVolumeSetting.addEventListener('input', (e) => {
      setAmbientVolume(Number(e.target.value) / 100);
    });
    els.ambientToggle.addEventListener('click', () => {
      setAmbientEnabled(!state.ambientEnabled);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.settingsPanel.hidden) {
        els.settingsPanel.hidden = true;
        els.settingsToggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('click', (e) => {
      if (!els.playlist.hidden &&
          !els.playlist.contains(e.target) &&
          e.target !== els.playlistToggle) {
        els.playlist.hidden = true;
        els.playlistToggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Pause ambient scheduling (not music) when the tab is hidden, to save
    // resources — resume seamlessly on return.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(state.ambientTimerId);
      } else if (state.hasEntered && state.ambientEnabled && !state.ambientTimerId && !state.ambientPlaying) {
        scheduleNextAmbient();
      }
    });
  }

  /* ----------------------------------------------------------------------
     10. BOOT
     ---------------------------------------------------------------------- */

  function boot() {
    loadSettings();
    renderPlaylist();

    els.songName.textContent = songs[state.currentSongIndex].name;
    els.musicVolumeSlider.value = String(Math.round(state.musicVolume * 100));
    els.musicVolumeSetting.value = String(Math.round(state.musicVolume * 100));
    els.musicVolVal.textContent = `${Math.round(state.musicVolume * 100)}%`;
    els.ambientVolumeSetting.value = String(Math.round(state.ambientVolume * 100));
    els.ambientVolVal.textContent = `${Math.round(state.ambientVolume * 100)}%`;
    els.ambientToggle.setAttribute('aria-checked', String(state.ambientEnabled));

    updatePlayPauseUI();
    els.iconVolOn.classList.toggle('icon-hidden', state.isMuted);
els.iconVolOff.classList.toggle('icon-hidden', !state.isMuted);
    wireEvents();

    // We always show the entry gate on load (per browser autoplay rules,
    // a fresh page load has no user gesture yet) — but a prior visit is
    // remembered so preferences carry over the moment they tap in.
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
