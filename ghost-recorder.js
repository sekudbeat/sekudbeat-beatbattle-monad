// public/js/ghost-recorder.js
// Drop-in recorder for the gameplay loop. Wire recordInputEvent(...) into
// wherever your existing pad/chord/bass/melody hit handlers and arrangement
// (mute/solo/section-shift) handlers already live — this file assumes those
// call sites, not that it owns them.
//
// Usage in your existing game code:
//
//   import { GhostRecorder } from './ghost-recorder.js';
//   const recorder = new GhostRecorder();
//   recorder.start();
//   ...
//   padEl.addEventListener('pointerdown', () => {
//     recorder.log('drum', 'hit', { pad: padIndex, velocity });
//     // ...your existing hit logic...
//   });
//   ...
//   const ghostPayload = recorder.finish({ wallet, trackId, difficulty, score, combo, accuracy, bpm });

export class GhostRecorder {
  constructor() {
    this.events = [];
    this.startTime = null;
  }

  start() {
    this.events = [];
    this.startTime = performance.now();
  }

  /**
   * @param {'drum'|'chord'|'bass'|'melody'|'arrangement'} lane
   * @param {string} action  e.g. 'hit' | 'mute' | 'solo' | 'shift' | 'fx'
   * @param {object} data    small payload — pad index, note, section id, etc.
   */
  log(lane, action, data = {}) {
    if (this.startTime == null) return; // recorder not started — no-op rather than throw
    this.events.push({
      t: Math.round(performance.now() - this.startTime),
      lane,
      action,
      data,
    });
  }

  /**
   * Call once at game-over. Returns the payload ready to POST to /api/ghost.
   */
  finish({ wallet, trackId, difficulty, score, combo = 0, accuracy = 0, bpm }) {
    const durationMs = Math.round(performance.now() - this.startTime);
    return {
      wallet,
      trackId,
      difficulty,
      score,
      combo,
      accuracy,
      bpm,
      durationMs,
      events: this.events,
    };
  }
}

/**
 * Submits the ghost, then the score referencing it. Two calls, sequenced,
 * so a ghost-upload failure doesn't silently drop the score — if the ghost
 * POST fails we still submit the score with ghostId: null rather than
 * losing the run entirely.
 */
export async function submitRunWithGhost(ghostPayload, scoreExtra = {}) {
  let ghostId = null;

  try {
    const ghostRes = await fetch('/api/ghost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ghostPayload),
    });
    if (ghostRes.ok) {
      const { ghostId: id } = await ghostRes.json();
      ghostId = id;
    } else {
      console.warn('[ghost] upload failed, submitting score without ghost link', await ghostRes.text());
    }
  } catch (err) {
    console.warn('[ghost] upload threw, submitting score without ghost link', err);
  }

  const scoreRes = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet: ghostPayload.wallet,
      trackId: ghostPayload.trackId,
      difficulty: ghostPayload.difficulty,
      score: ghostPayload.score,
      ghostId,
      ...scoreExtra,
    }),
  });

  if (!scoreRes.ok) throw new Error('Score submission failed');
  return scoreRes.json();
}
