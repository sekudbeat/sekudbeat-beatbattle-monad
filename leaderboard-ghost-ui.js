// public/js/leaderboard-ghost-ui.js
// Wires the Challenge Ghost list + battle handoff into your existing
// #screen-leaderboard markup. Add a container the leaderboard screen already
// doesn't have, e.g.:
//
//   <div id="ghost-challenge-list" class="ghost-list"></div>
//   <button id="ghost-challenge-start" disabled>Challenge Ghost</button>
//
// then call initLeaderboardGhostUI(currentTrackId, currentDifficulty) from
// wherever you currently populate the leaderboard rows.

import { loadChallengeableGhosts, loadAndScheduleGhost } from './ghost-playback.js';

let selectedGhostId = null;
let activeGhostHandle = null;

export function initLeaderboardGhostUI(trackId, difficulty) {
  const listEl = document.getElementById('ghost-challenge-list');
  const startBtn = document.getElementById('ghost-challenge-start');
  if (!listEl || !startBtn) return; // markup not added yet — fail quiet, not loud

  loadChallengeableGhosts(trackId, difficulty, listEl);

  window.addEventListener('ghost:challenge-selected', (e) => {
    selectedGhostId = e.detail.ghostId;
    startBtn.disabled = false;
    document.querySelectorAll('.ghost-row').forEach((el) => {
      el.classList.toggle('selected', el.dataset.ghostId === selectedGhostId);
    });
  });

  startBtn.addEventListener('click', async () => {
    if (!selectedGhostId) return;
    startBtn.disabled = true;
    startBtn.textContent = 'Loading ghost…';

    try {
      // onGhostEvent: route into whatever renders the opponent's half of the
      // battle screen. This should NOT touch the live player's score state —
      // treat it as a second, purely visual/audio "player" the same way you'd
      // treat a second local player in a split-screen mode.
      activeGhostHandle = await loadAndScheduleGhost(selectedGhostId, (evt, time) => {
        window.dispatchEvent(new CustomEvent('ghost:event', { detail: { evt, time } }));
      });

      window.dispatchEvent(new CustomEvent('ghost:battle-ready', {
        detail: { ghost: activeGhostHandle.ghost },
      }));

      // Hand off to your existing screen-transition logic, e.g.:
      // showScreen('screen-battle');
    } finally {
      startBtn.textContent = 'Challenge Ghost';
      startBtn.disabled = false;
    }
  });
}

/** Call when leaving the battle screen so scheduled Tone events don't leak. */
export function teardownActiveGhost() {
  activeGhostHandle?.cancel();
  activeGhostHandle = null;
  selectedGhostId = null;
}
