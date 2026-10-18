# Photo Geometry — 3D FOV/DOF planner

Experimental browser-only planner for placing a photographic camera in a 3D world and examining its **field-of-view frustum**, **depth-of-field volume**, focus plane, and the true directions of the **Sun, Moon, and Galactic Centre** at a specified instant.

## Features

- Place a camera via latitude/longitude or by clicking the map.
- Automatic **approximate bare-earth height** from Cesium World Terrain where available (not Google mesh rooftop heights). Edit ground elevation, camera height AGL or AMSL manually.
- Independent camera heading, pitch and roll; true-north basis.
- Nikon D850, Nikon FE, Nikon DX, Pentax 67, and custom sensor formats.
- Rectilinear FOV frustum, near/far DOF planes and translucent DOF region, focus plane and optical axis. Truncate the projection at an editable distance.
- Sun/Moon topocentric positions and approximate Galactic Centre direction; date/time slider; explicit UTC offset; numeric azimuth/altitude and "in FOV" indicators; aim-at-object controls.
- Basic camera view uses the same Cesium view (not a second renderer, and **not** a realistic photographic preview).
- Standard OSM fallback and optional Cesium-ion-hosted Google Photorealistic 3D Tiles.
- Saved local preferences, JSON export/import and shareable configuration links.

## Deploy to GitHub Pages

1. This repository contains the static application and the GitHub Pages deployment workflow.
2. In **Settings → Pages**, select **Source: GitHub Actions**. A push to `main` triggers the included workflow.
3. Open `https://mejtoogood.github.io/photo-geometry-planner/` once the deployment has succeeded.
4. For Google Photorealistic 3D, paste a **Cesium ion public access token** into the app and choose the Google 3D button. Set an appropriate token scope and referer restrictions in your Cesium account. The token is never included in exported JSON or shared links.

You can also open with a static local server, e.g. `python3 -m http.server 8000`, then `http://localhost:8000/`.

## Dependencies

No npm/build step; versions pinned via jsDelivr:
- CesiumJS 1.145.0
- Astronomy Engine 2.1.19

Code in this repository is vanilla HTML, CSS and JavaScript. The browser needs external network access for Cesium, Astronomy Engine and map tiles. External data providers have their own service terms and quotas.

## Mathematical conventions and limitations

- Camera FOV assumes an ideal rectilinear lens and uses physical sensor width/height and focal length. It does not model lens distortion or focus breathing.
- Depth of field uses conventional thin-lens hyperfocal equations based on a user-adjustable acceptable circle of confusion. DOF is a **threshold**, not an abrupt change in image sharpness. The visualised DOF ends at the user-specified projection extent; infinite DOF is not rendered to infinity.
- Google photogrammetry may show objects above bare-earth elevation. Google 3D and Cesium World Terrain can disagree. Pixel-based picking on buildings may not identify the underlying bare earth; manually correct height as necessary.
- Celestial positions come from [Astronomy Engine](https://github.com/cosinekitty/astronomy). Sun and Moon use topocentric equatorial positions and a standard approximate atmospheric refraction model. The Galactic Centre marker uses fixed J2000 ICRS coordinates of Sgr A* rotated into the local horizontal frame. Markers are **directional**; their finite scene distances are purely graphical and do not depict distance to astronomical bodies.
- The UTC offset is set explicitly, not auto-resolved from the selected map coordinates. DST changes require updating the offset. The date/time picker displays the wall clock of that offset; calculations use UTC.
- There is no precision terrain horizon, weather, exposure model, Milky Way texture, spherical photographic lens projection, accurate Moon disc rendering, or photo-realistic preview. Google mesh intersection/occlusion is visual and approximate.

## Validation

`node tests/optics.test.js` checks FOV and hyperfocal/DOF calculations. `node --check app.js` checks JavaScript syntax. Inspect and exercise the Cesium UI in a browser with CDN and ion access before relying on the results.

## Development

This is a prototype designed for further iteration. Modular optics and celestial direction calculations are separated into `optics.js` and `astro.js` so the mathematical work can be extended or independently tested.
