// NOT WIRED IN YET — see README "Anti-cheat" section.
//
// Right now /api/score trusts whatever number the client sends. That's fine
// for a casual prototype leaderboard, but anyone with devtools open can call
// the endpoint directly with score:100 and top every leaderboard.
//
// The real fix: have the client submit the full arrangement + pattern data
// (the same shape the frontend already builds in buildPattern/buildAdvancedPattern
// and state.arrangement) instead of a bare number, then recompute the score
// HERE, server-side, using the identical formula the frontend uses — and only
// trust that recomputed number. This file is a ported copy of that formula,
// ready to be called from pages/api/score.js once you wire up sending the
// pattern/arrangement data from the client instead of a raw score.

export function scoreSection(pattern, active) {
  let score = 45;
  const activeExtras = ["chords", "bass", "melody"].filter((k) => active[k]).length;
  score += activeExtras * 10;
  if (active.drums && pattern[0].kick) score += 10;

  let totalNotes = 0;
  pattern.forEach((e) => {
    if (e.kick && active.drums) totalNotes++;
    if (e.snare && active.drums) totalNotes++;
    if (e.hihat && active.drums) totalNotes++;
    if (e.chordNotes && active.chords) totalNotes++;
    if (e.bassNote && active.bass) totalNotes++;
    if (e.melodyNote && active.melody) totalNotes++;
  });
  score += totalNotes >= 14 && totalNotes <= 34 ? 15 : 5;
  return score;
}

export function scoreArrangement(pattern, arrangement) {
  const sectionScores = [0, 1, 2].map((sec) =>
    scoreSection(pattern, {
      drums: arrangement.drums[sec],
      chords: arrangement.chords[sec],
      bass: arrangement.bass[sec],
      melody: arrangement.melody[sec],
    })
  );
  const avg = sectionScores.reduce((a, b) => a + b, 0) / 3;
  const activeCounts = [0, 1, 2].map(
    (sec) => ["drums", "chords", "bass", "melody"].filter((k) => arrangement[k][sec]).length
  );
  const varies = new Set(activeCounts).size > 1;
  const arcBonus = varies ? 10 : 0;
  return Math.max(5, Math.min(100, Math.round(avg + arcBonus)));
}
