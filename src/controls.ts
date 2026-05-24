type Start = { lat: number; lng: number; alt: number; heading: number };

export type ActionName = "barrelRoll" | "dribble" | "brakeSpin";

export type FlightState = ReturnType<typeof createControls>;

const MIN_SPEED = 50 / 3.6;  // 50 km/h ≈ 13.9 m/s — plane never fully stalls
const MAX_SPEED = 500 / 3.6; // 500 km/h ≈ 139 m/s

// Altitude clamps (meters above ellipsoid / sea level).
const MIN_ALT = 120;   // never clips into terrain / rooftops
const MAX_ALT = 500;   // ceiling — keeps the city in clear view, no sky-only shots

// ===== Boost meter (charge-and-spend) =====
// Each card you hit fills the meter; when it tops out you bank a "boost charge"
// (boostLevel += 1). Pressing B *consumes* one charge and engages boost for
// BOOST_ACTIVE_MS — during that window the plane gets:
//   - An instant +200 km/h kick
//   - W's acceleration multiplied by 2^level (level at moment of activation)
//   - Ceiling raised by +200 km/h × level
// When the 5s window ends, boost disengages and the level drops by 1.
// Levels DO NOT decay on their own — they sit as inventory until spent.
const HITS_PER_BOOST_LEVEL = 3;
const BOOST_INSTANT_KICK_MS = 200 / 3.6; // +200 km/h in m/s
const BOOST_MAX_BONUS_MS = 200 / 3.6;    // +200 km/h added to MAX_SPEED per level
const BOOST_ACTIVE_MS = 5000;            // one boost activation lasts 5s

const maxSpeedFor = (boostLevel: number) => MAX_SPEED + boostLevel * BOOST_MAX_BONUS_MS;

type ActionSpec = {
  duration: number;
  label: string;
  apply: (state: MutableState, t: number, dt: number) => void;
  end?: (state: MutableState) => void;
};

type MutableState = {
  lat: number; lng: number; alt: number;
  heading: number; pitch: number; bank: number; roll: number;
  speed: number;
};

const ACTIONS: Record<ActionName, ActionSpec> = {
  barrelRoll: {
    duration: 1.4,
    label: "BARREL ROLL",
    apply(s, t) {
      // Spin the camera roll one full revolution; world rotates around the plane.
      s.roll = 360 * easeInOut(t);
    },
    end(s) { s.roll = 0; },
  },
  dribble: {
    duration: 1.8,
    label: "DRIBBLE",
    apply(s, t, dt) {
      // Rapid wing-wag side to side, with a small heading wiggle for the snake feel.
      const wag = Math.sin(t * Math.PI * 6);
      s.bank = wag * 32;
      s.heading += wag * 24 * dt;
    },
    end(s) { s.bank = 0; },
  },
  brakeSpin: {
    duration: 1.6,
    label: "BRAKE SPIN",
    apply(s, t, dt) {
      // Hard brake to floor while spinning 720° around the vertical axis.
      s.speed = lerp(s.speed, MIN_SPEED, 0.18);
      s.heading += 480 * dt;
      s.bank = lerp(s.bank, -42, 0.22);
    },
    end(s) { s.bank = 0; },
  },
};

export function createControls(start: Start) {
  const keys = new Set<string>();

  let action: { name: ActionName; spec: ActionSpec; elapsed: number } | null = null;

  const state = {
    lat: start.lat,
    lng: start.lng,
    alt: start.alt,
    heading: start.heading,
    pitch: 0,
    bank: 0,
    roll: 0,
    speed: 200 / 3.6, // 200 km/h ≈ 55.5 m/s — initial cruise; drains when W isn't held
    boostLevel: 0,            // banked charges available to spend
    boostFill: 0,             // 0..1 progress to next charge
    boostActive: false,       // currently engaged?
    boostActiveLevel: 0,      // snapshot of level at moment of activation
    boostActiveUntil: 0,      // performance.now() value at which active ends
    isThrottling: false,      // true while W is held (used by the boost FX overlay)
    _lastT: performance.now(),

    get activeAction(): ActionName | null {
      return action?.name ?? null;
    },

    get activeActionLabel(): string | null {
      return action?.spec.label ?? null;
    },

    triggerAction(name: ActionName) {
      if (action) return; // ignore stacking
      action = { name, spec: ACTIONS[name], elapsed: 0 };
    },

    /** Called once per scored card. Fills the meter and banks a charge when
     *  it overflows. Does NOT apply any speed effect — that happens on B. */
    registerCardHit() {
      this.boostFill += 1 / HITS_PER_BOOST_LEVEL;
      if (this.boostFill >= 1) {
        this.boostLevel += 1;
        this.boostFill = 0;
      }
    },

    /** Spend one charge to engage boost for 5s. No-op if no charges or if
     *  boost is already running (no double-stacking). */
    activateBoost() {
      if (this.boostActive) return;
      if (this.boostLevel <= 0) return;
      this.boostActive = true;
      this.boostActiveLevel = this.boostLevel; // snapshot at activation
      this.boostActiveUntil = performance.now() + BOOST_ACTIVE_MS;
      const newMax = maxSpeedFor(this.boostActiveLevel);
      this.speed = Math.min(newMax, this.speed + BOOST_INSTANT_KICK_MS);
    },

    resetTimer() {
      this._lastT = performance.now();
    },

    tick() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this._lastT) / 1000);
      this._lastT = now;

      // Update throttle flag every frame so the boost FX overlay reflects
      // W's state even when a trick action is bypassing input handling.
      this.isThrottling = keys.has("KeyW");

      // Active-boost expiry: once the 5s window ends, disengage and consume
      // one charge from the inventory.
      if (this.boostActive && now >= this.boostActiveUntil) {
        this.boostActive = false;
        this.boostActiveLevel = 0;
        this.boostLevel = Math.max(0, this.boostLevel - 1);
      }

      if (action) {
        // Action takes over orientation/speed for its duration.
        action.elapsed += dt;
        const t = Math.min(1, action.elapsed / action.spec.duration);
        action.spec.apply(this, t, dt);
        if (t >= 1) {
          action.spec.end?.(this);
          action = null;
        }
      } else {
        // Normal input handling
        if (keys.has("ArrowLeft")) {
          this.heading -= 35 * dt;
          this.bank = lerp(this.bank, -28, 0.18);
        } else if (keys.has("ArrowRight")) {
          this.heading += 35 * dt;
          this.bank = lerp(this.bank, 28, 0.18);
        } else {
          this.bank = lerp(this.bank, 0, 0.12);
        }

        if (keys.has("ArrowUp")) this.pitch = Math.min(25, this.pitch + 28 * dt);
        if (keys.has("ArrowDown")) this.pitch = Math.max(-45, this.pitch - 28 * dt);
        if (keys.has("Space")) this.pitch = lerp(this.pitch, 0, 0.12);

        // Multiplier + ceiling are ONLY in effect while boost is engaged.
        // Inventory level (boostLevel) is just a banked count of charges.
        const activeLevel = this.boostActive ? this.boostActiveLevel : 0;
        const boostMul = Math.pow(2, activeLevel); // 1, 2, 4, 8, …
        const maxSpeed = maxSpeedFor(activeLevel);
        if (this.isThrottling) {
          this.speed = Math.min(maxSpeed, this.speed + 75 * boostMul * dt);
        } else if (keys.has("KeyS")) {
          this.speed = Math.max(MIN_SPEED, this.speed - 160 * dt);
        } else if (this.speed > MIN_SPEED) {
          // Passive drag toward base MAX_SPEED — boosted speeds bleed off when
          // you're not actively boosting them.
          this.speed = Math.max(MIN_SPEED, this.speed - 30 * dt);
        }

        // Roll always relaxes outside actions
        this.roll = lerp(this.roll, 0, 0.2);
      }

      // Integrate position from heading + pitch (always)
      const h = toRad(this.heading);
      const p = toRad(this.pitch);
      const horiz = this.speed * Math.cos(p) * dt;
      let vert = this.speed * Math.sin(p) * dt;

      // Lift-vs-gravity: when the throttle (W) is NOT held the plane sinks.
      // The lower the speed, the faster it dips — slow flight = stalling.
      // While an action (barrel roll / boost / etc.) is running, skip the
      // sink so trick maneuvers don't get yanked down mid-air.
      if (!action && !keys.has("KeyW")) {
        // Quadratic stall curve: small sink at cruise, dramatic free-fall as
        // speed approaches zero. tuned so 60 m/s ≈ glide, 0 m/s ≈ ~110 m/s drop.
        const SINK_REF_SPEED = 60;  // m/s (~216 km/h) — minimum for clean glide
        const SINK_BASE = 5;        // m/s baseline sink when off throttle
        const SINK_SCALE_QUAD = 0.03;
        const deficit = Math.max(0, SINK_REF_SPEED - this.speed);
        const sinkRate = SINK_BASE + deficit * deficit * SINK_SCALE_QUAD;
        vert -= sinkRate * dt;
      }

      const dLat = (horiz * Math.cos(h)) / 111_111;
      const dLng = (horiz * Math.sin(h)) / (111_111 * Math.cos(toRad(this.lat)));

      this.lat += dLat;
      this.lng += dLng;
      // Clamp altitude so we never dive below ground or fly off into space.
      // If clamped, also zero out the corresponding pitch direction so the
      // plane doesn't keep "trying" to push past the floor/ceiling.
      const nextAlt = this.alt + vert;
      if (nextAlt <= MIN_ALT) {
        this.alt = MIN_ALT;
        if (this.pitch < 0) this.pitch = 0;
      } else if (nextAlt >= MAX_ALT) {
        this.alt = MAX_ALT;
        if (this.pitch > 0) this.pitch = 0;
      } else {
        this.alt = nextAlt;
      }
      this.heading = ((this.heading % 360) + 360) % 360;
    },
  };

  const ACTION_KEYS: Record<string, ActionName> = {
    KeyR: "barrelRoll",
    KeyZ: "dribble",
    KeyC: "brakeSpin",
    // KeyB is reserved for boost activation — handled separately below.
  };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "KeyB") {
      state.activateBoost();
      e.preventDefault();
      return;
    }
    const trickName = ACTION_KEYS[e.code];
    if (trickName) {
      state.triggerAction(trickName);
      e.preventDefault();
      return;
    }
    keys.add(e.code);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  return state;
}

const toRad = (d: number) => (d * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
