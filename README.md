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
