// Server-side port of the pattern-building constants/functions defined
// inline in public/game.html (buildPattern, buildAdvancedPattern, and the
// DRUM_PRESETS/CHORD_PRESETS/etc tables they read from). Kept in lockstep by
// hand, the same way lib/scoring.js mirrors game.html's scoreArrangement —
// if you change one of the preset tables or builders in game.html, mirror
// the change here too, or server-side score verification will silently
// disagree with what the client shows.
//
// Used by pages/api/score.js and pages/api/ghost.js to reconstruct a
// player's 16-step pattern from the compact { mode, picks, advanced }
// submission they send, so the server can recompute the score itself
// instead of trusting a client-supplied number.

export const DRUM_PRESETS = {
  "Punchy trap":   { kick:[0,3,6,10,12],      snare:[4,12],        hihat:[0,2,3,4,6,7,8,10,11,12,14,15] },
  "Chill lo-fi":   { kick:[0,7,10],           snare:[4,12],        hihat:[2,6,10,14] },
  "Four on floor": { kick:[0,4,8,12],         snare:[4,12],        hihat:[2,6,10,14] },
  "Boom bap":      { kick:[0,10],             snare:[4,12],        hihat:[0,2,4,6,8,10,12,14] },
};

export const CHORD_PRESETS = {
  "Dreamy":     ["Am","F","C","G"],
  "Dark":       ["Am","Dm","Em","Am"],
  "Uplifting":  ["C","G","Am","F"],
  "Moody":      ["Am","G","F","Em"],
};

export const CHORD_NOTES = {
  Am:["A3","C4","E4"], F:["F3","A3","C4"], C:["C3","E3","G3"], G:["G3","B3","D4"],
  Dm:["D3","F3","A3"], Em:["E3","G3","B3"], Bdim:["B3","D4","F4"],
};

export const CHORD_ROOT = { Am:"A2", F:"F2", C:"C2", G:"G2", Dm:"D2", Em:"E2", Bdim:"B2" };

export const BASS_STYLES = ["Deep sub", "Groovy pluck", "Growly wobble", "Warm round"];

export const MELODY_PRESETS = {
  "Sparkly lead": ["E4",null,"C4",null,"D4",null,"E4","G4",null,"E4",null,"C4","D4",null,null,"A4"],
  "Simple hook":  ["A4",null,null,null,"C4",null,null,null,"E4",null,null,null,"D4",null,null,null],
  "Airy pad":     ["A4",null,null,null,null,null,null,null,"E4",null,null,null,null,null,null,null],
  "Plucky arp":   ["A3","C4","E4","A4","E4","C4","A3","C4","E4","A4","E4","C4","A3","C4","E4","A4"],
};

export function buildPattern(picks) {
  const drum = DRUM_PRESETS[picks.drums];
  const chordSeq = CHORD_PRESETS[picks.chords];
  const bassStyle = picks.bass;
  const melody = MELODY_PRESETS[picks.melody];

  const pattern = [];
  for (let step = 0; step < 16; step++) {
    const seg = Math.floor(step / 4);
    const segPos = step % 4;
    const chordName = chordSeq[seg];
    const entry = {
      kick: drum.kick.includes(step) ? 1 : 0,
      snare: drum.snare.includes(step) ? 1 : 0,
      hihat: drum.hihat.includes(step) ? 1 : 0,
      chordNotes: segPos === 0 ? CHORD_NOTES[chordName] : null,
      bassNote: null,
      melodyNote: melody[step],
    };
    const root = CHORD_ROOT[chordName];
    if (bassStyle === "Deep sub" && segPos === 0) entry.bassNote = { note: root, dur: "2n" };
    if (bassStyle === "Groovy pluck" && (segPos === 0 || segPos === 2)) entry.bassNote = { note: root, dur: "8n" };
    if (bassStyle === "Growly wobble" && segPos === 0) entry.bassNote = { note: root, dur: "2n" };
    if (bassStyle === "Warm round" && (segPos === 0 || segPos === 2)) entry.bassNote = { note: root, dur: "4n" };
    pattern.push(entry);
  }
  return pattern;
}

export function buildAdvancedPattern(adv) {
  const pattern = [];
  for (let step = 0; step < 16; step++) {
    const seg = Math.floor(step / 4);
    const segPos = step % 4;
    const chordName = adv.chordSlots[seg];
    pattern.push({
      kick: adv.drums.kick[step] || 0,
      snare: adv.drums.snare[step] || 0,
      hihat: adv.drums.hihat[step] || 0,
      chordNotes: segPos === 0 ? CHORD_NOTES[chordName] : null,
      bassNote: adv.bass[step] ? { note: adv.bass[step], dur: "8n" } : null,
      melodyNote: adv.melody[step],
    });
  }
  return pattern;
}

/* ---------- validation ----------
 * The client's UI can only ever produce well-shaped picks/advanced objects,
 * but the API has to assume a caller can POST anything. These just check
 * shape/type well enough that buildPattern/buildAdvancedPattern above can't
 * throw or silently mis-score — they don't need to validate note names
 * against the "real" scale, since bogus note names only ever hurt a score
 * (falsy CHORD_NOTES/lookup misses), never inflate one.
 */

function isNumArray(arr, len) {
  return Array.isArray(arr) && arr.length === len && arr.every((v) => typeof v === "number");
}

function isNoteArray(arr, len) {
  return Array.isArray(arr) && arr.length === len && arr.every((v) => v === null || typeof v === "string");
}

export function isValidPicks(picks) {
  if (!picks || typeof picks !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(DRUM_PRESETS, picks.drums) &&
    Object.prototype.hasOwnProperty.call(CHORD_PRESETS, picks.chords) &&
    BASS_STYLES.includes(picks.bass) &&
    Object.prototype.hasOwnProperty.call(MELODY_PRESETS, picks.melody)
  );
}

export function isValidAdvanced(adv) {
  if (!adv || typeof adv !== "object") return false;
  if (!adv.drums || typeof adv.drums !== "object") return false;
  if (!isNumArray(adv.drums.kick, 16)) return false;
  if (!isNumArray(adv.drums.snare, 16)) return false;
  if (!isNumArray(adv.drums.hihat, 16)) return false;
  if (!Array.isArray(adv.chordSlots) || adv.chordSlots.length !== 4) return false;
  if (!isNoteArray(adv.bass, 16)) return false;
  if (!isNoteArray(adv.melody, 16)) return false;
  return true;
}

export function isValidArrangement(arrangement) {
  if (!arrangement || typeof arrangement !== "object") return false;
  return ["drums", "chords", "bass", "melody"].every(
    (k) => Array.isArray(arrangement[k]) && arrangement[k].length === 3
  );
}

export function isValidSampleAssign(sampleAssign) {
  if (sampleAssign == null) return true; // optional — treated as "nothing assigned"
  if (typeof sampleAssign !== "object") return false;
  return ["drums", "chords", "bass", "melody"].every((k) => {
    if (!(k in sampleAssign)) return true;
    const v = sampleAssign[k];
    return v === null || typeof v === "string" || typeof v === "boolean";
  });
}

// Reconstructs the 16-step pattern a submission's { mode, picks, advanced }
// describes, or returns null if it doesn't describe a valid one (caller
// should treat that as a 400, not silently fall back to trusting a score).
export function reconstructPattern({ mode, picks, advanced }) {
  if (mode === "advanced") {
    if (!isValidAdvanced(advanced)) return null;
    return buildAdvancedPattern(advanced);
  }
  if (mode === "beginner") {
    if (!isValidPicks(picks)) return null;
    return buildPattern(picks);
  }
  return null;
}
