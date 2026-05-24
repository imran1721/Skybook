# Flying Portfolio

A paper plane glides over Google's photorealistic 3D city tiles. Buildings along the route surface portfolio cards as you fly past.

## Setup

1. Get a **Google Maps Platform** API key with **Map Tiles API** enabled
   → https://developers.google.com/maps/documentation/tile/3d-tiles-overview
2. Configure env:
   ```
   cp .env.example .env
   # paste your key into VITE_GOOGLE_MAPS_API_KEY
   ```
3. Install + run:
   ```
   pnpm install   # or npm install
   pnpm dev
   ```
4. Open the URL Vite prints (usually `http://localhost:5173`).

## Controls

| Key      | Action            |
|----------|-------------------|
| ↑ / ↓    | Pitch up / down   |
| ← / →    | Turn (with bank)  |
| W / S    | Throttle up / down |
| Space    | Level out         |

## Customize your portfolio

Edit `src/poi-data.ts`:

- `START` — where the plane spawns + initial heading
- `POIS` — list of `{ lat, lng, alt, title, body }` cards anchored to buildings

Pick coords from Google Maps (right-click → "What's here?"). Use altitudes ~50–100m above street level so the cards float just above building tops.

## Architecture

- **Cesium** renders Google Photorealistic 3D Tiles via `Cesium3DTileset.fromUrl`
- **Plane** is a fixed-center SVG; bank rotation comes from turn input
- **Camera** is moved every frame from a `{lat, lng, alt, heading, pitch}` flight state
- **POIs** are HTML cards projected to screen with `SceneTransforms.wgs84ToWindowCoordinates`, faded by distance

Files:
- `src/main.ts` — viewer bootstrap + per-frame camera update
- `src/tileset.ts` — Google 3D Tiles loader
- `src/controls.ts` — keyboard → flight-state integrator
- `src/plane.ts` — SVG bank transform
- `src/billboards.ts` — POI projection + visibility
- `src/poi-data.ts` — your portfolio entries (edit me)

## Notes

- The globe ellipsoid is hidden; non-tiled regions show black. Google's photorealistic coverage is most major cities worldwide.
- POI occlusion is naive (distance-based, not depth-tested). To hide cards behind buildings, sample the depth buffer at the projected pixel — easy add later.
- In production, restrict your API key to your deployed domain in Google Cloud Console.
- Google's attribution must remain visible (`showCreditsOnScreen: true` is on by default).
