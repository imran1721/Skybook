import * as Cesium from "cesium";
import type { FlightState } from "./controls";

const MODEL_URL = "/models/plane.glb";

// Cesium_Air.glb's natural forward axis is its local +X (not +Y as Cesium's
// HPR convention expects), so we rotate the model -90° on heading to align
// its nose with the flight direction.
// If you swap in a different plane GLB and it points the wrong way, try 0, ±90, 180.
const HEADING_OFFSET_DEG = -90;

// ===== Scratch instances shared across the render loop =====
// CallbackProperty + updateChaseCamera both run at 60 fps; reusing these
// instances avoids ~10 disposable allocations per frame (GC pressure).
const _posScratch = new Cesium.Cartesian3();
const _orientPosScratch = new Cesium.Cartesian3();
const _hprScratch = new Cesium.HeadingPitchRoll();
const _chasePlanePos = new Cesium.Cartesian3();
const _chaseOffsetENU = new Cesium.Cartesian3();
const _chaseEnuFrame = new Cesium.Matrix4();
const _chaseOffsetECEF = new Cesium.Cartesian3();
const _chaseCameraPos = new Cesium.Cartesian3();

/**
 * Mount a 3D plane in the world. Returns `null` if the GLB file isn't present,
 * so the caller can fall back to the HUD overlay + first-person camera.
 */
export async function setupPlane3d(viewer: Cesium.Viewer, state: FlightState) {
  // Probe so a missing model is a clean no-op instead of a Cesium console error.
  // Vite's SPA fallback returns HTML+200 for missing public files, so we also
  // check the first 4 bytes for the GLB magic header (`glTF`).
  const probe = await fetch(MODEL_URL, { headers: { Range: "bytes=0-3" } }).catch(() => null);
  let magicOk = false;
  if (probe && probe.ok) {
    const buf = await probe.arrayBuffer().catch(() => null);
    if (buf && buf.byteLength >= 4) {
      const bytes = new Uint8Array(buf);
      // 0x67 0x6c 0x54 0x46 = "glTF"
      magicOk = bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
    }
  }
  if (!magicOk) {
    console.warn(
      `[plane3d] no valid GLB at ${MODEL_URL} — falling back to HUD overlay. See public/models/README.md.`
    );
    return null;
  }
  console.info(`[plane3d] mounted ${MODEL_URL} — chase camera engaged.`);

  const positionProp = new Cesium.CallbackProperty((_time, result) => {
    const out = (result as Cesium.Cartesian3 | undefined) ?? _posScratch;
    return Cesium.Cartesian3.fromDegrees(state.lng, state.lat, state.alt, undefined, out);
  }, false);

  const orientationProp = new Cesium.CallbackProperty((_time, result) => {
    Cesium.Cartesian3.fromDegrees(state.lng, state.lat, state.alt, undefined, _orientPosScratch);
    _hprScratch.heading = Cesium.Math.toRadians(state.heading + HEADING_OFFSET_DEG);
    _hprScratch.pitch = Cesium.Math.toRadians(state.pitch);
    _hprScratch.roll = Cesium.Math.toRadians(state.bank + state.roll);
    return Cesium.Transforms.headingPitchRollQuaternion(
      _orientPosScratch,
      _hprScratch,
      undefined, // ellipsoid → default WGS84
      undefined, // fixedFrameTransform → default ENU
      result as Cesium.Quaternion | undefined
    );
  }, false);

  viewer.entities.add({
    position: positionProp,
    orientation: orientationProp,
    model: {
      uri: MODEL_URL,
      minimumPixelSize: 80,
      maximumScale: 200,
      scale: 0.9,
      runAnimations: false,
    },
  });

  return {
    /** Chase-camera tunables (HeadingPitchRange semantics). */
    range: 90,           // distance from plane to camera (m)
    pitchDeg: -5,        // 5° above plane — near-level chase
  };
}

/**
 * Front-facing chase cam, jitter-free.
 *
 * Camera sits BEHIND the plane in its flight direction, raised by `pitchDeg`
 * above the plane's horizon, looking forward. World-coordinate setView (rather
 * than lookAt) avoids the floating-point jitter that comes from re-anchoring
 * the camera to a moving target's reference frame each frame.
 */
export function updateChaseCamera(
  viewer: Cesium.Viewer,
  state: FlightState,
  cfg: { range: number; pitchDeg: number }
) {
  // Make sure no prior lookAt transform is still locking the camera.
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  Cesium.Cartesian3.fromDegrees(state.lng, state.lat, state.alt, undefined, _chasePlanePos);
  const h = Cesium.Math.toRadians(state.heading);

  // Sign convention:
  //   cfg.pitchDeg = -20 → camera is 20° ABOVE the plane
  //   cfg.pitchDeg = +20 → camera is 20° BELOW the plane
  const elev = Cesium.Math.toRadians(-cfg.pitchDeg);
  const cos = Math.cos(elev);
  const sin = Math.sin(elev);

  // Camera sits BEHIND the plane (opposite of its heading direction) and
  // looks forward in the same direction the plane is flying.
  _chaseOffsetENU.x = -Math.sin(h) * cos * cfg.range;
  _chaseOffsetENU.y = -Math.cos(h) * cos * cfg.range;
  _chaseOffsetENU.z = sin * cfg.range;

  Cesium.Transforms.eastNorthUpToFixedFrame(_chasePlanePos, undefined, _chaseEnuFrame);
  Cesium.Matrix4.multiplyByPointAsVector(_chaseEnuFrame, _chaseOffsetENU, _chaseOffsetECEF);
  Cesium.Cartesian3.add(_chasePlanePos, _chaseOffsetECEF, _chaseCameraPos);

  viewer.camera.setView({
    destination: _chaseCameraPos,
    orientation: {
      heading: Cesium.Math.toRadians(state.heading),
      pitch: Cesium.Math.toRadians(cfg.pitchDeg),
      roll: 0,
    },
  });
}
