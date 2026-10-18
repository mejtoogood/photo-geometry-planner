# Photo Geometry Planner

Experimental static 3D photographic geometry planner using CesiumJS and Astronomy Engine, deployed via GitHub Pages.

## Features

- Place a camera by clicking on the map or entering latitude/longitude. Set estimated ground elevation and adjust AGL / AMSL camera height.
- Visualise rectilinear camera field-of-view frustum, focus plane and approximate depth-of-field volume; optionally switch to a basic camera viewpoint.
- Lens scrubbers for focal length and focus distance (logarithmic scales), and a discrete nominal third-stop aperture selector.
- Camera sensor presets (Nikon D850, Nikon FE, Nikon DX, Pentax 67) and configurable circle of confusion under **Camera format & optical assumptions**.
- Aim at the Sun, Moon, galactic core, or a user-defined point. Custom target placement supports coordinate entry, map picking, and independent ground/AGL/AMSL height controls.
- Astronomical directional markers and schematic 24-hour trajectories for each celestial object, with dashed below-horizon segments; date, time and UTC offset controls.
- Celestial sky-shell radius is independently adjustable as a multiple of the projection extent (default 3×, with no 3 km cap). Markers and arcs can optionally render through obstructing terrain and 3D Tiles.
- The solid background sky switches between fixed colours for each solar phase (no interpolation). Sunrise/sunset and twilight table rows display their matching swatches, with the currently selected phase highlighted. The table uses the camera location and chosen UTC offset; click any calculated event to set the planner's time.
- Local browser settings, shareable URLs and configuration JSON export/import.

The trajectories are **directional diagrams on a virtual sky shell**, not physical-distance orbital paths. Its radius affects display distance but not astronomical azimuth/altitude or optical field of view. Showing celestial lines through terrain uses Cesium's `depthFailMaterial` and may exhibit GPU-dependent visual artifacts. Terrain elevations are approximate. The simulator makes no photorealistic exposure or obstruction claims.

## Hosting

Under **Settings → Pages**, select **GitHub Actions**. The workflow in `.github/workflows/pages.yml` deploys every push to `main`.

Site URL: https://mejtoogood.github.io/photo-geometry-planner/

Google Photorealistic 3D Tiles require a Cesium ion token entered in the app; it remains in local browser storage and is not committed to this repository.

## Tests

With Node.js:

```sh
node tests/optics.test.js
node tests/controls.test.js
node tests/ui.test.js
node tests/sky-shell.test.js
node tests/solar-phases.test.js
node --check app.js
```

The camera projection and astronomical visualisations still require browser testing with live Cesium/CDN connectivity.

## Solar-phase conventions

A simplified solid-colour sky switches discretely at solar-altitude thresholds (it does not change terrain/3D-tile lighting). Civil twilight and blue hour overlap, and sunrise/sunset lie within golden hour, so the sky uses short civil (−6° to −5.5°) and horizon (−0.9° to +0.9°) colour bands. The table's established event times are unchanged. The blue-hour interval is Sun centre −6° to −4°, and golden hour is −4° to +6°. Civil (−6°), nautical (−12°), and astronomical (−18°) dawn/dusk events use Astronomy Engine's `SearchAltitude`; sunrise/sunset use `SearchRiseSet` (apparent upper limb and standard atmospheric refraction). The chosen local calendar date and manually entered UTC offset define the time table. Polar-day/night dates may have missing events.

## Camera view consistency

The camera preview now uses the **same forward/right/up orientation vectors** as the FOV geometry, including the selected roll. A 90° roll intentionally rotates the image sideways; use **Level camera (roll 0°)** to reset. Celestial locations in camera view are screen-space markers derived from angular direction, not line segments extending towards the sky shell. The shell and its 24-hour arcs continue to appear only in planning view. The outlined camera frame uses the selected sensor FOV and is calibrated to the Cesium viewport's margins.

## Long-distance planning view

For projection extents above **1 km**, the tool switches automatically to wireframe geometry. Extremely large translucent polygons across a Google Photorealistic 3D scene previously obscured the terrain. The FOV extent, optical calculations, and focus distances are unchanged, but the projected FOV/DOF/focus surfaces are drawn as outlines only. Schematic celestial markers and the 24-hour trajectory arcs remain visible; redundant rays extending all the way from the camera to each celestial marker are removed. Camera view uses a separate angle-based overlay and now includes a visible roll-reset button. Roll set to 90° intentionally rotates the image sideways.

## Google 3D surface heights

When the Google Photorealistic 3D Tiles layer is active, clicking to place a camera or target now **preserves the clicked mesh surface height**, instead of overriding it with Cesium World Terrain. Resampling explicitly queries the Google 3D Tiles mesh using `scene.sampleHeightMostDetailed`, then falls back to Cesium World Terrain only if no Google surface can be sampled. The elevation source is shown beside the camera/target height fields. A photogrammetry mesh may return roof/tree elevation rather than bare ground; the values remain manually editable. Google 3D camera views close to the surface may still show mesh artefacts where models are imperfect.
