// Server-side port of the scoring formula defined inline in
// public/game.html (scoreSection/scoreArrangement). Now wired into
// pages/api/score.js and pages/api/ghost.js: both routes reconstruct the
// submitted pattern via lib/pattern.js and recompute the score here,
// instead of trusting a client-supplied number. Keep this in lockstep by
// hand with game.html's copy — if you change the formula there (including
// the sampleAssign handling), mirror the change here too, or server-side
// verification will silently disagree with what the client showed the
// player.

export function scoreSection(pattern, active, sampleAssign) {
  sampleAssign = sampleAssign || {};
  let score = 45;
  const activeExtras = ["chords", "bass", "melody"].filter((k) => active[k]).length;
  score += activeExtras * 10;
  if (active.drums && (pattern[0].kick || sampleAssign.drums)) score += 10;

  let totalNotes = 0;
  pattern.forEach((e) => {
    if (e.kick && active.drums) totalNotes++;
    if (e.snare && active.drums) totalNotes++;
    if (e.hihat && active.drums) totalNotes++;
    if (e.chordNotes && active.chords) totalNotes++;
    if (e.bassNote && active.bass) totalNotes++;
    if (e.melodyNote && active.melody) totalNotes++;
  });
  ["drums", "chords", "bass", "melody"].forEach((l) => {
    if (sampleAssign[l] && active[l]) totalNotes += 6;
  });
  score += totalNotes >= 14 && totalNotes <= 34 ? 15 : 5;
  return score;
}

export function scoreArrangement(pattern, arrangement, sampleAssign) {
  const sectionScores = [0, 1, 2].map((sec) =>
    scoreSection(
      pattern,
      {
        drums: arrangement.drums[sec],
        chords: arrangement.chords[sec],
        bass: arrangement.bass[sec],
        melody: arrangement.melody[sec],
      },
      sampleAssign
    )
  );
  const avg = sectionScores.reduce((a, b) => a + b, 0) / 3;
  const activeCounts = [0, 1, 2].map(
    (sec) => ["drums", "chords", "bass", "melody"].filter((k) => arrangement[k][sec]).length
  );
  const varies = new Set(activeCounts).size > 1;
  const arcBonus = varies ? 10 : 0;
  return Math.max(5, Math.min(100, Math.round(avg + arcBonus)));
}
