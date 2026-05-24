# Models

Drop a small plane GLB at `public/models/plane.glb` to enable third-person 3D flight.

If the file is absent the app falls back to the original HUD overlay automatically.

## Quick start — Cesium's sample plane (~12 KB)

```bash
curl -L -o public/models/plane.glb \
  https://github.com/CesiumGS/cesium/raw/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb
```

That's the classic Cesium tutorial plane. It's small, ships with the right axis convention (nose along the local frame's forward axis), and looks like a generic prop airliner.

## Alternatives

Any `.glb` plane will work. Free options:
- [Khronos glTF sample models](https://github.com/KhronosGroup/glTF-Sample-Assets)
- [Sketchfab — search "low poly plane glb"](https://sketchfab.com/search?q=plane+low+poly&type=models)

If the model's nose points along the wrong axis, you can rotate it in Blender or apply a `headingOffset` in `src/plane3d.ts`.
