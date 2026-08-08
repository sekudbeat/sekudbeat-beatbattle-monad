// public/js/ghost-playback.js
// Powers the "Challenge Ghost" button on screen-leaderboard. Fetches a
// stored ghost's full event log and replays it on Tone.Transport in lockstep
// with the live player's run, driving whatever visual "opponent lane" UI
// you add alongside the player's own board.
//
// This assumes Tone.js is already loaded globally (as in your current setup)
// and that you expose a way to trigger the SAME hit-handling functions the
// live player uses, so the ghost's hits actually make sound/score visually
// rather than just animating.

/**
 * Populates the "Challenge Ghost" list on the leaderboard screen.
 * Call this when screen-leaderboard is shown.
 */
export async function loadChallengeableGhosts(trackId, difficulty, listEl) {
  const res = await fetch(`/api/ghost?trackId=${encodeURIComponent(trackId)}&difficulty=${encodeURIComponent(difficulty)}&limit=10`);
  if (!res.ok) {
    listEl.innerHTML = '<p class="ghost-empty">No ghosts available for this track yet.</p>';
    return;
  }
  const { ghosts } = await res.json();

  listEl.innerHTML = '';
  ghosts.forEach((g) => {
    const row = document.createElement('button');
    row.className = 'ghost-row';
    row.dataset.ghostId = g._id;
    row.innerHTML = `
      <span class="ghost-wallet">${shortenWallet(g.wallet)}</span>
      <span class="ghost-score">${g.score.toLocaleString()}</span>
      <span class="ghost-accuracy">${g.accuracy}%</span>
    `;
    row.addEventListener('click', () => window.dispatchEvent(
      new CustomEvent('ghost:challenge-selected', { detail: { ghostId: g._id } })
    ));
    listEl.appendChild(row);
  });
}

function shortenWallet(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : 'unknown';
}

/**
 * Loads a full ghost event log and schedules it against Tone.Transport so
 * playback stays sample-accurate against the live player's own scheduling.
 *
 * @param {string} ghostId
 * @param {(evt: {lane:string, action:string, data:object}) => void} onGhostEvent
 *        Your existing hit-resolution function, called once per ghost event
 *        at the right transport time — route this to the "opponent" half of
 *        your reveal/battle UI, not the player's own scoring state.
 */
export async function loadAndScheduleGhost(ghostId, onGhostEvent) {
  const res = await fetch(`/api/ghost?id=${encodeURIComponent(ghostId)}`);
  if (!res.ok) throw new Error('Failed to load ghost');
  const { ghost } = await res.json();

  const scheduledIds = [];

  ghost.events.forEach((evt) => {
    const id = Tone.Transport.schedule((time) => {
      onGhostEvent(evt, time);
    }, evt.t / 1000); // stored as ms, Tone wants seconds
    scheduledIds.push(id);
  });

  return {
    ghost,
    /** Call on battle end / screen exit to avoid leaking scheduled callbacks. */
    cancel() {
      scheduledIds.forEach((id) => Tone.Transport.clear(id));
    },
  };
}
