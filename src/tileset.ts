import * as Cesium from "cesium";

export async function loadGoogleTiles(viewer: Cesium.Viewer, apiKey: string) {
  const url = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;

  // Probe the root.json directly so we get a readable error if auth fails.
  // Cesium swallows the body on a 4xx and just throws "Failed to load".
  const probe = await fetch(url);
  if (!probe.ok) {
    const body = await probe.text();
    throw new Error(
      `Google 3D Tiles request failed: ${probe.status} ${probe.statusText}\n${body}`
    );
  }

  const tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
    showCreditsOnScreen: true,
  });

  tileset.tileFailed.addEventListener((err) => {
    console.error("[tileset.tileFailed]", err);
  });

  viewer.scene.primitives.add(tileset);
  return tileset;
}
