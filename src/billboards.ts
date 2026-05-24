import * as Cesium from "cesium";
import type { POI } from "./poi-data";
import type { FlightState } from "./controls";

// Cards pop up as you fly, in priority order. Each card is anchored to a real
// world point ~spawn-ahead-m in front of the plane at the moment it spawns —
// so it appears on a different building each time, but stays "stuck" to that
// point as you fly past.

// ===== Spawn / lifecycle =====
// Trimmed deck (~13 cards) calls for slower, calmer pacing — each card gets
// long enough on screen that you can actually READ it before it leaves.
const SPAWN_DISTANCE_M = 200;       // travel this far before next billboard
const SPAWN_MIN_INTERVAL_MS = 2500; // never spawn faster than this
const SPAWN_AHEAD_BASE_M = 550;     // base anchor distance ahead of plane
const SPAWN_AHEAD_VAR_M = 600;      // random extra (550–1150m total)
const SPAWN_LATERAL_DEG = 45;       // ± lateral spread off the heading
const VISIBLE_MS = 20000;           // 20s — reader-friendly
const FADE_IN_MS = 500;
const FADE_OUT_MS = 800;
const MAX_VISIBLE = 5;              // fewer cards on screen, more focus
const TOTAL_LIFE_MS = FADE_IN_MS + VISIBLE_MS + FADE_OUT_MS;

// ===== Distance-based scale =====
const SCALE_REF_DIST_M = 350;       // distance at which scale = 1
const SCALE_MIN = 0.7;              // far away
const SCALE_MAX = 1.6;              // up close

// ===== Hit detection =====
const TEAR_DIST_M = 130;            // proximity radius — passing nearby is enough
const VISUAL_HIT_MAX_DIST_M = 450;  // gate so a far card visually overlapping the plane doesn't count
const HIT_MIN_OPACITY = 0.3;        // card must be at least this visible to score

// ===== Occlusion against plane =====
const OCC_DEPTH_GATE_M = 60;        // card must be at least this much farther than plane
const OCC_PLANE_RADIUS_PX = 80;     // approximate plane sprite radius for overlap check
const OCC_HOLE_SCREEN_RADIUS_PX = 90;
const OCC_HOLE_SOFT_EDGE_PX = 22;
const PLANE_PASSED_OPACITY = 0.45;  // translucency once plane has flown past

// ===== Tear-through effect =====
const TEAR_STRIPS = 8;
const TEAR_DURATION_MS = 900;

// ===== Scratch instance to avoid per-frame allocation =====
const _planePos3d = new Cesium.Cartesian3();

type Active = {
  poi: POI;
  el: HTMLDivElement;
  world: Cesium.Cartesian3;
  lat: number;
  lng: number;
  spawnedAt: number;
  torn?: boolean;
};

export function setupPOIs(
  viewer: Cesium.Viewer,
  pois: POI[],
  onCardHit?: (poi: POI) => void,
  /** Random pool used as fallback when the main queue is empty.
   *  In endless mode, pass FILLER_POIS so the sky never runs out. */
  fillerPool?: POI[]
) {
  const layer = document.getElementById("poi-layer");
  if (!layer) throw new Error("#poi-layer element missing");
  const chipsEl = document.getElementById("collection-chips");

  const totalCards = pois.length;
  const queue: POI[] = [...pois];
  const originalSet = new Set(pois); // used to decide what to recycle on despawn
  const active: Active[] = [];
  const usingFiller = !!fillerPool && fillerPool.length > 0;

  let score = 0;
  const collectedSlugs = new Set<string>();
  const collected: POI[] = [];
  let lastLat: number | null = null;
  let lastLng: number | null = null;
  let distSinceSpawn = 0;
  let lastSpawnAt = 0;

  function updateScoreHUD() {
    const el = document.getElementById("score-value");
    if (!el) return;
    el.textContent = String(score);
    el.classList.remove("pulse");
    // Force a reflow so the animation restarts on every hit.
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  function addCollectionChip(poi: POI) {
    if (!chipsEl || !poi.projectSlug) return;
    if (collectedSlugs.has(poi.projectSlug)) return;
    collectedSlugs.add(poi.projectSlug);
    collected.push(poi);

    const chip = document.createElement(poi.href ? "a" : "div");
    chip.className = "collection-chip";
    if (poi.href) {
      (chip as HTMLAnchorElement).href = poi.href;
      (chip as HTMLAnchorElement).target = "_blank";
      (chip as HTMLAnchorElement).rel = "noopener noreferrer";
    }
    chip.innerHTML =
      `<span class="chip-dot" style="background:${poi.accent ?? "#5eead4"}"></span>` +
      `<span class="chip-title">${esc(poi.title)}</span>`;
    chipsEl.appendChild(chip);
    // Animate in
    requestAnimationFrame(() => chip.classList.add("visible"));
  }

  return {
    getScore() {
      return score;
    },
    getTotalCards() {
      return totalCards;
    },
    getCollected() {
      return collected.slice();
    },

    /** The closest active card (by horizontal distance from the plane) that
     *  isn't already torn — used by the read-mode (hold Shift) overlay. */
    getNearestVisiblePOI(state: FlightState): POI | null {
      let best: { dist: number; poi: POI } | null = null;
      for (const a of active) {
        if (a.torn) continue;
        const dist = haversineMeters(state.lat, state.lng, a.lat, a.lng);
        if (!best || dist < best.dist) best = { dist, poi: a.poi };
      }
      return best?.poi ?? null;
    },

    update(state: FlightState) {
      const now = performance.now();

      // Accumulate distance traveled
      if (lastLat !== null && lastLng !== null) {
        distSinceSpawn += haversineMeters(lastLat, lastLng, state.lat, state.lng);
      }
      lastLat = state.lat;
      lastLng = state.lng;

      // Plane position in world / screen — computed once per frame
      Cesium.Cartesian3.fromDegrees(state.lng, state.lat, state.alt, undefined, _planePos3d);
      const planeScreen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, _planePos3d);
      const cameraToPlane = Cesium.Cartesian3.distance(viewer.camera.position, _planePos3d);
      const fwdLat = Math.cos(toRad(state.heading));
      const fwdLng = Math.sin(toRad(state.heading));

      // Spawn the next POI if eligible. If the main queue is exhausted but a
      // filler pool was provided (endless mode), pull a random filler.
      const hasSpawnable = queue.length > 0 || usingFiller;
      const canSpawn =
        hasSpawnable &&
        distSinceSpawn >= SPAWN_DISTANCE_M &&
        now - lastSpawnAt >= SPAWN_MIN_INTERVAL_MS &&
        active.length < MAX_VISIBLE;

      if (canSpawn) {
        const poi =
          queue.length > 0
            ? queue.shift()!
            : fillerPool![Math.floor(Math.random() * fillerPool!.length)];
        const anchor = anchorAheadOfPlane(state);
        const el = createCard(poi);
        layer.appendChild(el);
        active.push({
          poi,
          el,
          world: anchor.world,
          lat: anchor.lat,
          lng: anchor.lng,
          spawnedAt: now,
        });
        distSinceSpawn = 0;
        lastSpawnAt = now;
      }

      // Walk active cards backwards so we can splice in place (avoids array
      // re-allocation each frame from `.filter`).
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i];
        const age = now - a.spawnedAt;

        if (age >= TOTAL_LIFE_MS) {
          a.el.remove();
          // Natural despawn: only recycle ORIGINAL project/skill cards back
          // to the queue. Filler cards (random pool) just vanish — next spawn
          // pulls a fresh random one, so the sky never feels repetitive.
          if (originalSet.has(a.poi)) queue.push(a.poi);
          active.splice(i, 1);
          continue;
        }

        const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, a.world);
        if (!win) {
          a.el.style.opacity = "0";
          continue;
        }

        const onScreen =
          win.x > -200 && win.x < window.innerWidth + 200 &&
          win.y > -200 && win.y < window.innerHeight + 200;

        let opacity: number;
        if (age < FADE_IN_MS) {
          opacity = age / FADE_IN_MS;
        } else if (age < FADE_IN_MS + VISIBLE_MS) {
          opacity = 1;
        } else {
          opacity = 1 - (age - FADE_IN_MS - VISIBLE_MS) / FADE_OUT_MS;
        }
        if (!onScreen) opacity = 0;

        const cameraDist = Cesium.Cartesian3.distance(viewer.camera.position, a.world);
        const scale = clamp(SCALE_MIN, SCALE_REF_DIST_M / cameraDist, SCALE_MAX);
        const depthAhead = cameraDist - cameraToPlane;

        // One getBoundingClientRect per card per frame — also used for the
        // mask coords below and the score pop position if we tear.
        const cardRect = a.el.getBoundingClientRect();

        // Has the plane already FLOWN PAST this card?
        // Dot product of (card - plane) with the plane's forward heading.
        const aheadDot = (a.lat - state.lat) * fwdLat + (a.lng - state.lng) * fwdLng;
        const planeHasPassed = aheadDot < 0;

        const overlapsPlane =
          !!planeScreen &&
          planeScreen.x >= cardRect.left - OCC_PLANE_RADIUS_PX &&
          planeScreen.x <= cardRect.right + OCC_PLANE_RADIUS_PX &&
          planeScreen.y >= cardRect.top - OCC_PLANE_RADIUS_PX &&
          planeScreen.y <= cardRect.bottom + OCC_PLANE_RADIUS_PX;

        a.el.style.left = `${win.x}px`;
        a.el.style.top = `${win.y}px`;
        a.el.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(3)})`;

        // Manual occlusion via mask-image: cut a hole exactly where the plane
        // sprite is, so the plane visually blocks just that region rather than
        // the whole card being painted over.
        if (planeHasPassed) {
          opacity *= PLANE_PASSED_OPACITY;
          setMask(a.el, "");
        } else if (overlapsPlane && depthAhead > OCC_DEPTH_GATE_M && planeScreen) {
          const holeR = OCC_HOLE_SCREEN_RADIUS_PX / scale;
          const holeInner = Math.max(20, holeR - OCC_HOLE_SOFT_EDGE_PX);
          const planeRelX = (planeScreen.x - cardRect.left) / scale;
          const planeRelY = (planeScreen.y - cardRect.top) / scale;
          const mask =
            `radial-gradient(circle at ${planeRelX.toFixed(1)}px ${planeRelY.toFixed(1)}px, ` +
            `transparent ${holeInner.toFixed(1)}px, black ${holeR.toFixed(1)}px)`;
          setMask(a.el, mask);
        } else {
          setMask(a.el, "");
        }

        a.el.style.opacity = String(Math.max(0, opacity));

        // Two ways to score a hit:
        //   1) Horizontal proximity — fly within TEAR_DIST_M of the pin
        //   2) Visual hit — plane's screen position inside card rect, gated by
        //      horizontal distance so far cards visually overlapping don't fire
        const horizDist = haversineMeters(state.lat, state.lng, a.lat, a.lng);
        const visualHit =
          !!planeScreen &&
          horizDist < VISUAL_HIT_MAX_DIST_M &&
          planeScreen.x >= cardRect.left &&
          planeScreen.x <= cardRect.right &&
          planeScreen.y >= cardRect.top &&
          planeScreen.y <= cardRect.bottom;

        if (!a.torn && opacity > HIT_MIN_OPACITY && (horizDist < TEAR_DIST_M || visualHit)) {
          a.torn = true;
          tearCard(a.el, layer);
          score += 1;
          updateScoreHUD();
          spawnScorePop(cardRect.left + cardRect.width / 2, cardRect.top + cardRect.height / 2);
          addCollectionChip(a.poi);
          onCardHit?.(a.poi);
          active.splice(i, 1);
        }
      }
    },
  };
}

function setMask(el: HTMLElement, value: string) {
  el.style.maskImage = value;
  el.style.setProperty("-webkit-mask-image", value);
}

function spawnScorePop(x: number, y: number) {
  const pop = document.createElement("div");
  pop.className = "score-pop";
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  pop.textContent = "+1";
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 1100);
}

function anchorAheadOfPlane(state: FlightState): { world: Cesium.Cartesian3; lat: number; lng: number } {
  // Spawn 50m BELOW the plane's current altitude. With the slightly
  // tilted-down chase camera, the cards project right into the plane's
  // forward path on screen — the plane visually plows into them.
  const ahead = SPAWN_AHEAD_BASE_M + Math.random() * SPAWN_AHEAD_VAR_M;
  const lateralRad = ((Math.random() - 0.5) * 2 * SPAWN_LATERAL_DEG * Math.PI) / 180;
  const angle = toRad(state.heading) + lateralRad;
  const dLat = (ahead * Math.cos(angle)) / 111_111;
  const dLng = (ahead * Math.sin(angle)) / (111_111 * Math.cos(toRad(state.lat)));
  const lat = state.lat + dLat;
  const lng = state.lng + dLng;
  const cardAlt = Math.max(50, state.alt - 50);
  return { world: Cesium.Cartesian3.fromDegrees(lng, lat, cardAlt), lat, lng };
}

function createCard(poi: POI): HTMLDivElement {
  // Outer wrapper holds the pin (via ::before/::after) and the card body.
  const el = document.createElement("div");
  el.className = "poi";

  const card = document.createElement("div");
  card.className = "poi-card";
  const parts: string[] = [`<span class="poi-bar"></span>`];
  if (poi.kicker) parts.push(`<div class="poi-kicker">${esc(poi.kicker)}</div>`);
  parts.push(`<h3>${esc(poi.title)}</h3>`);
  parts.push(`<p>${esc(poi.body)}</p>`);
  card.innerHTML = parts.join("");

  el.appendChild(card);
  return el;
}

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * "Tear" the billboard: clone it into N vertical strips that fly outward,
 * rotate, and fade. Adds a quick impact flash at the centerpoint.
 */
function tearCard(el: HTMLElement, parent: HTMLElement) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    el.remove();
    return;
  }

  // Impact flash
  const flash = document.createElement("div");
  flash.className = "poi-flash";
  flash.style.left = `${rect.left + rect.width / 2}px`;
  flash.style.top = `${rect.top + rect.height / 2}px`;
  parent.appendChild(flash);
  setTimeout(() => flash.remove(), 220);

  const stripPctW = 100 / TEAR_STRIPS;

  for (let i = 0; i < TEAR_STRIPS; i++) {
    const strip = el.cloneNode(true) as HTMLElement;
    strip.classList.add("poi-strip");
    strip.style.position = "fixed";
    strip.style.left = `${rect.left}px`;
    strip.style.top = `${rect.top}px`;
    strip.style.width = `${rect.width}px`;
    strip.style.height = `${rect.height}px`;
    strip.style.margin = "0";
    strip.style.opacity = "1";
    strip.style.transition = "none";
    strip.style.transformOrigin = "center center";

    const leftPct = i * stripPctW;
    const rightPct = 100 - (i + 1) * stripPctW;
    strip.style.transform = "none";
    strip.style.clipPath = `inset(0 ${rightPct}% 0 ${leftPct}%)`;
    strip.style.setProperty("-webkit-clip-path", strip.style.clipPath);

    parent.appendChild(strip);

    // Fly each strip outward — strips on the left go left, right go right,
    // with vertical scatter + spin for shred feel.
    const centerOffset = i + 0.5 - TEAR_STRIPS / 2;
    const xVel = centerOffset * 70 + (Math.random() - 0.5) * 40;
    const yVel = 60 + Math.random() * 90;
    const rot = centerOffset * 14 + (Math.random() - 0.5) * 20;

    strip.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1, filter: "brightness(1.4)" },
        { transform: `translate(${xVel}px, ${yVel}px) rotate(${rot}deg)`, opacity: 0, filter: "brightness(1)" },
      ],
      {
        duration: TEAR_DURATION_MS,
        easing: "cubic-bezier(0.2, 0.6, 0.4, 1)",
        fill: "forwards",
      }
    );

    setTimeout(() => strip.remove(), TEAR_DURATION_MS + 50);
  }

  el.remove();
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const toRad = (d: number) => (d * Math.PI) / 180;
