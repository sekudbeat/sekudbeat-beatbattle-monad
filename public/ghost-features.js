// public/ghost-features.js
// Adds async "Challenge Ghost" leaderboards on top of the existing solo-vs-AI
// battle flow. Loads AFTER game.html's own <script> block (see the
// <script src="/ghost-features.js"> tag near the end of game.html), so it
// freely uses everything already defined there — state, api, walletAddress,
// buildPattern, buildAdvancedPattern, scoreArrangement, scoreSection,
// showScreen, DIFFICULTIES, SECTIONS, shortAddress, renderDiffPills — with
// no imports, since it's a second classic <script> tag sharing the same
// global scope, not a module.

(function () {
  let recording = null;   // the in-progress ghost log for the current round
  let ghostTimers = [];   // scheduled setTimeout ids for replaying a challenged ghost
  let ghostPatternCache = null;

  /* ---------- recording the player's own arrangement toggles ---------- */

  function onBuildStart() {
    recording = {
      startTime: performance.now(),
      mode: state.mode,
      picks: state.mode === "beginner" ? { ...state.picks } : null,
      advanced: state.mode === "advanced" ? JSON.parse(JSON.stringify(state.advanced)) : null,
      events: [],
    };
    ensureGhostPanel();
    if (state.activeGhost) {
      startGhostReplay(state.activeGhost);
    } else {
      hideGhostPanel();
    }
  }

  function logToggle(layer, section, on) {
    if (!recording) return;
    recording.events.push({ t: Math.round(performance.now() - recording.startTime), layer, section, on });
  }

  async function onRoundEnd() {
    stopGhostReplay();
    if (!recording || !walletAddress) return;
    // yourScore isn't sent — the server recomputes the ghost's score itself
    // from mode/picks/advanced/finalArrangement/sampleAssign the same way
    // pages/api/score.js does (see lib/scoring.js + lib/pattern.js), so a
    // saved ghost can't be planted with an inflated score either.
    const payload = {
      difficulty: state.aiDifficulty,
      mode: recording.mode,
      picks: recording.picks,
      advanced: recording.advanced,
      finalArrangement: JSON.parse(JSON.stringify(state.arrangement)),
      sampleAssign: JSON.parse(JSON.stringify(state.sampleAssign)),
      events: recording.events,
      durationMs: Math.round(performance.now() - recording.startTime),
    };
    try {
      await api("/api/ghost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // a failed ghost upload shouldn't block the score submission that follows
    }
  }

  /* ---------- supplying a ghost as the reveal-phase opponent ---------- */

  function reconstructGhostPattern(ghost) {
    if (ghost.mode === "advanced" && ghost.advanced) return buildAdvancedPattern(ghost.advanced);
    if (ghost.picks) return buildPattern(ghost.picks);
    return null; // ghost used a custom uploaded sample we have no way to fetch back
  }

  function getOpponent() {
    const ghost = state.activeGhost;
    if (!ghost) return null;
    const pattern = ghostPatternCache || reconstructGhostPattern(ghost);
    if (!pattern) return null; // fall back to the normal AI opponent
    return {
      pattern,
      arrangement: ghost.finalArrangement,
      label: "GHOST \u00B7 " + (ghost.name || shortAddress(ghost.address)),
    };
  }

  /* ---------- live replay panel during the 30s build phase ---------- */

  function ensureGhostPanel() {
    if (document.getElementById("ghost-panel")) return;
    const buildScreen = document.getElementById("screen-build");
    const hint = buildScreen.querySelector(".hint");
    const panel = document.createElement("div");
    panel.id = "ghost-panel";
    panel.className = "live-meter-wrap";
    panel.style.display = "none";
    panel.innerHTML =
      '<div class="live-meter-label"><span>\u{1F47B} Ghost \u2014 <span id="ghost-panel-name"></span></span><span id="ghost-hype-num">0</span></div>' +
      '<div class="meter-track"><div class="meter-fill live" id="meter-ghost" style="background:linear-gradient(90deg,#8A5CFF,#FF3B5C)"></div></div>' +
      '<div id="ghost-log" style="max-height:70px; overflow-y:auto; margin-top:6px; font-size:11px; color:#9494B8;"></div>';
    buildScreen.insertBefore(panel, hint);
  }

  function hideGhostPanel() {
    const panel = document.getElementById("ghost-panel");
    if (panel) panel.style.display = "none";
  }

  function startGhostReplay(ghost) {
    ensureGhostPanel();
    ghostPatternCache = reconstructGhostPattern(ghost);
    if (!ghostPatternCache) { hideGhostPanel(); return; }

    const panel = document.getElementById("ghost-panel");
    panel.style.display = "block";
    document.getElementById("ghost-panel-name").textContent = ghost.name || shortAddress(ghost.address);
    document.getElementById("ghost-log").innerHTML = "";
    document.getElementById("meter-ghost").style.width = "0%";
    document.getElementById("ghost-hype-num").textContent = "0";

    const liveArrangement = {
      drums: [false, false, false], chords: [false, false, false],
      bass: [false, false, false], melody: [false, false, false],
    };
    const scale = 30000 / (ghost.durationMs || 30000);

    (ghost.events || []).forEach((evt) => {
      const timer = setTimeout(() => {
        liveArrangement[evt.layer][evt.section] = evt.on;
        const sec = state.currentSection;
        const active = {
          drums: liveArrangement.drums[sec], chords: liveArrangement.chords[sec],
          bass: liveArrangement.bass[sec], melody: liveArrangement.melody[sec],
        };
        const score = Math.max(5, Math.min(100, Math.round(scoreSection(ghostPatternCache, active, {}))));
        document.getElementById("meter-ghost").style.width = score + "%";
        document.getElementById("ghost-hype-num").textContent = score;

        const line = document.createElement("div");
        line.textContent = "Ghost turned " + (evt.on ? "ON" : "off") + " " + evt.layer + " in " + SECTIONS[evt.section].name;
        document.getElementById("ghost-log").prepend(line);
      }, evt.t * scale);
      ghostTimers.push(timer);
    });
  }

  function stopGhostReplay() {
    ghostTimers.forEach(clearTimeout);
    ghostTimers = [];
  }

  /* ---------- picking a ghost to challenge, from the leaderboard screen ---------- */

  function clearChallenge() {
    state.activeGhost = null;
    ghostPatternCache = null;
    renderGhostBanner();
    hideGhostPanel();
  }

  async function challengeGhost(ghostId) {
    try {
      const res = await api("/api/ghost?id=" + ghostId);
      const data = await res.json();
      if (!data.ghost) { alert("Could not load that ghost."); return; }
      state.activeGhost = data.ghost;
      ghostPatternCache = null;
      state.aiDifficulty = data.ghost.difficulty;
      renderDiffPills();
      showScreen("screen-setup");
      renderGhostBanner();
    } catch (e) {
      alert("Could not reach the backend to load that ghost.");
    }
  }

  function renderGhostBanner() {
    let el = document.getElementById("ghost-banner");
    if (!state.activeGhost) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "ghost-banner";
      el.className = "lib-badge";
      el.style.marginBottom = "12px";
      document.getElementById("screen-setup").insertBefore(el, document.getElementById("mode-toggle"));
    }
    const g = state.activeGhost;
    el.innerHTML = "\u{1F47B} Ghost challenge loaded \u2014 beat " + (g.name || shortAddress(g.address)) +
      "'s score of " + g.score + '<span class="clear-link">Clear</span>';
    el.querySelector(".clear-link").onclick = clearChallenge;
  }

  async function renderGhostList(difficultyKey) {
    const wrap = document.getElementById("ghost-list");
    if (!wrap) return;
    wrap.innerHTML = '<div class="hint">Loading ghosts...</div>';
    try {
      const res = await api("/api/ghost?difficulty=" + difficultyKey + "&limit=10");
      const data = await res.json();
      const ghosts = data.ghosts || [];
      if (ghosts.length === 0) {
        wrap.innerHTML = '<div class="hint">No ghost replays yet for this tier \u2014 play a round to leave one.</div>';
        return;
      }
      wrap.innerHTML = "";
      ghosts.forEach((g) => {
        const row = document.createElement("div");
        row.className = "lb-row";
        row.innerHTML =
          '<div class="lb-avatar">' + (g.avatarUrl ? '<img src="' + g.avatarUrl + '">' : "\u{1F464}") + "</div>" +
          '<div class="lb-name">' + (g.name || shortAddress(g.address)) + "</div>" +
          '<div class="lb-score">' + g.score + "</div>";
        const btn = document.createElement("button");
        btn.className = "lib-btn";
        btn.title = "Challenge this ghost";
        btn.textContent = "\u2694";
        btn.onclick = () => challengeGhost(g._id);
        row.appendChild(btn);
        wrap.appendChild(row);
      });
    } catch (e) {
      wrap.innerHTML = '<div class="hint">Couldn\u2019t load ghost replays.</div>';
    }
  }

  window.ghostFeatures = {
    onBuildStart, logToggle, onRoundEnd, getOpponent,
    clearChallenge, renderGhostBanner, renderGhostList,
  };
})();
