import * as Cesium from "cesium";
import { loadGoogleTiles } from "./tileset";
import { createControls } from "./controls";
import { setupPlane } from "./plane";
import { setupPOIs } from "./billboards";
import { setupPlane3d, updateChaseCamera } from "./plane3d";
import { POIS, FILLER_POIS, START } from "./poi-data";

const GAME_DURATION_MS = 30_000; // 30 second play time

// ===== Shared helpers (module scope so both bootstrap paths can use them) =====
const escapeMap: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
function escapeText(s: string) {
  return s.replace(/[&<>"']/g, (c) => escapeMap[c]);
}
function escapeAttr(s: string) {
  return escapeText(s);
}

function renderResumeView() {
  const container = document.getElementById("resume-projects");
  if (!container) return;
  const projects = POIS.filter((p) => p.projectSlug);
  container.innerHTML = projects
    .map((p) => {
      const tag = p.href ? "a" : "div";
      const attrs = p.href
        ? ` href="${escapeAttr(p.href)}" target="_blank" rel="noopener noreferrer"`
        : "";
      const accentVar = p.accent ? `--accent:${p.accent};` : "";
      return (
        `<${tag} class="resume-project"${attrs} style="${accentVar}">` +
        (p.kicker ? `<div class="rp-kicker">${escapeText(p.kicker)}</div>` : "") +
        `<div class="rp-title">${escapeText(p.title)}</div>` +
        `<div class="rp-body">${escapeText(p.body)}</div>` +
        (p.stack ? `<div class="rp-stack">${escapeText(p.stack)}</div>` : "") +
        (p.href ? `<div class="rp-link-hint">View case study ↗</div>` : "") +
        `</${tag}>`
      );
    })
    .join("");
}

// ===== Mobile vs desktop dispatch =====
// Touch-only devices and narrow viewports skip the game entirely (no keyboard,
// heavy 3D scene on mobile = bad). They land directly on the resume view.
const IS_TOUCH = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
const IS_NARROW = window.innerWidth < 900;
const IS_MOBILE = IS_TOUCH || IS_NARROW;

if (IS_MOBILE) {
  bootstrapMobile();
} else {
  bootstrapDesktop();
}

/** Mobile path: render the resume view immediately, skip Cesium / game UI. */
function bootstrapMobile() {
  // Remove (or hide) all the game-only chrome so it can't accidentally render
  // and burn battery / leak focus.
  for (const id of [
    "cesium",
    "plane-layer",
    "poi-layer",
    "hud",
    "score-hud",
    "collection-panel",
    "mode-toggle",
    "zoom-card",
    "loader",
  ]) {
    document.getElementById(id)?.remove();
  }

  renderResumeView();

  // Show a small mobile-only banner so visitors know there's a game version.
  const inner = document.querySelector("#resume-view .resume-inner");
  if (inner) {
    const notice = document.createElement("div");
    notice.className = "resume-mobile-notice";
    notice.innerHTML =
      `<span class="mn-icon">💡</span><span>Bonus: there's also a fly-through game version of this portfolio — try it on desktop.</span>`;
    inner.insertBefore(notice, inner.firstChild);
  }

  document.getElementById("resume-view")?.classList.remove("hidden");
}

/** Desktop path: full game + resume + intro. */
async function bootstrapDesktop() {
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!GOOGLE_API_KEY) {
    document.body.innerHTML =
      `<pre style="color:white;padding:24px;font-family:monospace;">
Missing VITE_GOOGLE_MAPS_API_KEY.

1. cp .env.example .env
2. Paste your Google Maps Platform key (Map Tiles API enabled)
3. pnpm dev
</pre>`;
    throw new Error("Missing VITE_GOOGLE_MAPS_API_KEY");
  }

  Cesium.Ion.defaultAccessToken = "";

  const viewer = new Cesium.Viewer("cesium", {
    baseLayer: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });

  viewer.scene.globe.show = false;
  viewer.scene.screenSpaceCameraController.enableInputs = false;

  const loaderEl = document.getElementById("loader")!;

  let tileset: Cesium.Cesium3DTileset;
  try {
    tileset = await loadGoogleTiles(viewer, GOOGLE_API_KEY);
  } catch (err) {
    loaderEl.classList.add("hidden");
    const banner = document.createElement("pre");
    banner.style.cssText =
      "position:fixed;top:16px;left:16px;right:16px;z-index:100;background:#7f1d1d;color:white;padding:16px;border-radius:8px;font-family:monospace;font-size:12px;white-space:pre-wrap;";
    banner.textContent = `Tileset load failed:\n\n${(err as Error).message}`;
    document.body.appendChild(banner);
    console.error(err);
    throw err;
  }

  const plane = setupPlane();
  const state = createControls(START);
  // Card hits feed the boost meter — pass a thin callback so billboards.ts
  // doesn't need to know about the controls module.
  // FILLER_POIS is always passed: in timed mode (30s) the main queue never
  // empties, so it's unused; in endless mode it kicks in as the sky's safety
  // net once all portfolio cards have been collected.
  const pois = setupPOIs(
    viewer,
    POIS,
    () => state.registerCardHit(),
    FILLER_POIS
  );

  const plane3d = await setupPlane3d(viewer, state);
  if (plane3d) {
    const planeLayer = document.getElementById("plane-layer");
    if (planeLayer) planeLayer.style.display = "none";
  }

  const hudStats = document.getElementById("hud-stats")!;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(START.lng, START.lat, START.alt),
    orientation: {
      heading: Cesium.Math.toRadians(START.heading),
      pitch: 0,
      roll: 0,
    },
  });

  renderResumeView();

  // Wait for tiles, then for the user to click Take off.
  // The "View as resume" link in the intro opens the deployed portfolio in a
  // new tab — it doesn't dismiss the intro, so the user can still take off here.
  // initialTilesLoaded can hang indefinitely if any tile request stalls, so we
  // race it against a max wait — tiles keep streaming in once we take off.
  const MAX_TILE_WAIT_MS = 6000;
  let endlessMode = false;
  await new Promise<void>((resolve) => {
    let armed = false;
    const armTakeoff = () => {
      if (armed) return;
      armed = true;
      const btn = document.getElementById("intro-start") as HTMLButtonElement;
      const text = btn.querySelector(".intro-start-text") as HTMLSpanElement;
      btn.disabled = false;
      btn.classList.add("ready");
      text.textContent = "Take off ↗";

      const endlessBox = document.getElementById("intro-endless") as HTMLInputElement;
      btn.addEventListener(
        "click",
        () => {
          loaderEl.classList.add("hidden");
          endlessMode = endlessBox?.checked ?? false;
          resolve();
        },
        { once: true }
      );
    };

    const off = tileset.initialTilesLoaded.addEventListener(() => {
      off();
      clearTimeout(timer);
      armTakeoff();
    });
    const timer = setTimeout(() => {
      off();
      armTakeoff();
    }, MAX_TILE_WAIT_MS);
  });

  state.resetTimer();

  // === Game timer (pause-aware) ===
  let playedMs = 0;
  let lastPlayingTickAt = performance.now();
  let isPlaying = true;
  let gameOver = false;

  const timerEl = document.getElementById("timer-value")!;
  const timerLabelEl = timerEl.previousElementSibling as HTMLElement | null;
  if (endlessMode) {
    timerEl.textContent = "∞";
    if (timerLabelEl) timerLabelEl.textContent = "ENDLESS";
  }

  const boostFillEl = document.getElementById("boost-fill")!;
  const boostLevelEl = document.getElementById("boost-level")!;
  const boostFxEl = document.getElementById("boost-fx")!;
  let lastBoostLevel = 0;
  const gameOverEl = document.getElementById("game-over")!;
  const finalScoreEl = document.getElementById("final-score")!;
  const finalTotalEl = document.getElementById("final-total")!;
  const replayBtn = document.getElementById("go-replay")!;
  const resumeViewEl = document.getElementById("resume-view")!;
  const modeToggleEl = document.getElementById("mode-toggle") as HTMLButtonElement;
  const modeToggleLabel = document.getElementById("mode-toggle-label")!;

  replayBtn.addEventListener("click", () => location.reload());

  function setPlaying(playing: boolean) {
    if (playing === isPlaying) return;
    if (isPlaying) {
      playedMs += performance.now() - lastPlayingTickAt;
    } else {
      lastPlayingTickAt = performance.now();
      state.resetTimer();
    }
    isPlaying = playing;
  }

  function openResumeMode() {
    setPlaying(false);
    resumeViewEl.classList.remove("hidden");
    modeToggleEl.classList.remove("hidden");
    modeToggleLabel.textContent = "🎮 Back to game";
  }

  function closeResumeMode() {
    resumeViewEl.classList.add("hidden");
    modeToggleLabel.textContent = "📋 Resume";
    setPlaying(true);
  }

  modeToggleEl.addEventListener("click", () => {
    if (gameOver) return;
    if (resumeViewEl.classList.contains("hidden")) openResumeMode();
    else closeResumeMode();
  });

  modeToggleEl.classList.remove("hidden");
  modeToggleLabel.textContent = "📋 Resume";

  // ===== Hold-Shift read mode =====
  const zoomEl = document.getElementById("zoom-card")!;
  const zoomKickerEl = document.getElementById("zoom-kicker")!;
  const zoomTitleEl = document.getElementById("zoom-title")!;
  const zoomBodyEl = document.getElementById("zoom-body")!;
  const zoomStackEl = document.getElementById("zoom-stack")!;
  const zoomLinkEl = document.getElementById("zoom-link") as HTMLAnchorElement;
  let zoomActive = false;

  function openZoomMode() {
    if (gameOver) return;
    if (zoomActive) return;
    const poi = pois.getNearestVisiblePOI(state);
    if (!poi) return;
    zoomKickerEl.textContent = poi.kicker ?? "";
    zoomTitleEl.textContent = poi.title;
    zoomBodyEl.textContent = poi.body;
    zoomStackEl.textContent = poi.stack ?? "";
    if (poi.href) {
      zoomLinkEl.href = poi.href;
      zoomLinkEl.classList.remove("hidden");
    } else {
      zoomLinkEl.classList.add("hidden");
    }
    zoomEl.classList.remove("hidden");
    zoomActive = true;
    setPlaying(false);
  }

  function closeZoomMode() {
    if (!zoomActive) return;
    zoomEl.classList.add("hidden");
    zoomActive = false;
    if (resumeViewEl.classList.contains("hidden")) setPlaying(true);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Shift") return;
    if (e.repeat) return;
    if (gameOver) return;
    if (!resumeViewEl.classList.contains("hidden")) return;
    if (!loaderEl.classList.contains("hidden")) return;
    openZoomMode();
  });
  window.addEventListener("keyup", (e) => {
    if (e.key !== "Shift") return;
    closeZoomMode();
  });
  window.addEventListener("blur", closeZoomMode);

  function endGame() {
    gameOver = true;
    finalScoreEl.textContent = String(pois.getScore());
    finalTotalEl.textContent = String(pois.getTotalCards());

    const collected = pois.getCollected();
    const collectedEl = document.getElementById("go-collected")!;
    if (collected.length === 0) {
      collectedEl.innerHTML =
        `<div class="go-collected-empty">No projects collected — try again to hit some cards!</div>`;
    } else {
      const chips = collected
        .map((p) => {
          const tag = p.href ? "a" : "div";
          const attrs = p.href
            ? ` href="${escapeAttr(p.href)}" target="_blank" rel="noopener noreferrer"`
            : "";
          return (
            `<${tag} class="go-collected-chip"${attrs}>` +
            `<span class="chip-dot" style="background:${p.accent ?? "#5eead4"}"></span>` +
            `<span class="chip-title">${escapeText(p.title)}</span>` +
            `</${tag}>`
          );
        })
        .join("");
      collectedEl.innerHTML =
        `<div class="go-collected-label">Collected — ${collected.length} project${collected.length === 1 ? "" : "s"}</div>` +
        `<div class="go-collected-grid">${chips}</div>`;
    }

    gameOverEl.classList.remove("hidden");
  }

  viewer.scene.preUpdate.addEventListener(() => {
    if (gameOver || !isPlaying) return;
    state.tick();

    if (endlessMode) return; // no timer to update, no game-over to trigger

    const elapsed = playedMs + (performance.now() - lastPlayingTickAt);
    const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
    const totalSec = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    timerEl.classList.toggle("warning", totalSec <= 15 && totalSec > 5);
    timerEl.classList.toggle("critical", totalSec <= 5);

    if (remaining === 0) endGame();
  });

  viewer.scene.preRender.addEventListener(() => {
    if (plane3d) {
      updateChaseCamera(viewer, state, plane3d);
    } else {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(state.lng, state.lat, state.alt),
        orientation: {
          heading: Cesium.Math.toRadians(state.heading),
          pitch: Cesium.Math.toRadians(state.pitch),
          roll: Cesium.Math.toRadians(state.roll),
        },
      });
      plane.setBank(state.bank);
    }

    if (!gameOver && isPlaying) pois.update(state);

    // Boost HUD — fill bar shows progress to next charge; level number shows
    // banked charges (×1 / ×2 / ×4 …). When boost is ENGAGED (B pressed),
    // the level number reflects the snapshot multiplier and pulses; warns
    // orange in the last 1.5s before disengage.
    boostFillEl.style.width = `${Math.min(1, state.boostFill) * 100}%`;
    const displayLevel = state.boostActive ? state.boostActiveLevel : state.boostLevel;
    boostLevelEl.textContent = `×${Math.pow(2, displayLevel)}`;
    boostLevelEl.classList.toggle("active", state.boostLevel > 0 || state.boostActive);
    boostLevelEl.classList.toggle("engaged", state.boostActive);
    if (state.boostLevel > lastBoostLevel) {
      boostLevelEl.classList.remove("level-up");
      void boostLevelEl.offsetWidth;
      boostLevelEl.classList.add("level-up");
    }
    lastBoostLevel = state.boostLevel;
    const msLeft = state.boostActiveUntil - performance.now();
    boostLevelEl.classList.toggle(
      "expiring",
      state.boostActive && msLeft > 0 && msLeft < 1500
    );

    // Boost FX overlay — only when boost is actually ENGAGED (B pressed).
    // Intensity + animation speed scale with the active level snapshot.
    const fxActive = state.boostActive;
    boostFxEl.classList.toggle("active", fxActive);
    if (fxActive) {
      const lvl = state.boostActiveLevel;
      const intensity = Math.min(1, 0.5 + lvl * 0.25);
      const lineSpeed = Math.max(0.18, 0.75 / lvl);
      const pulseSpeed = Math.max(0.3, 0.95 / lvl);
      boostFxEl.style.setProperty("--bfx-intensity", String(intensity));
      boostFxEl.style.setProperty("--bfx-line-speed", `${lineSpeed.toFixed(2)}s`);
      boostFxEl.style.setProperty("--bfx-pulse-speed", `${pulseSpeed.toFixed(2)}s`);
    }

    const action = state.activeActionLabel ? `  ⚡ ${state.activeActionLabel}` : "";
    hudStats.textContent =
      `alt ${state.alt.toFixed(0)}m  spd ${(state.speed * 3.6).toFixed(0)} km/h  hdg ${state.heading.toFixed(0)}°${action}`;
  });
}
