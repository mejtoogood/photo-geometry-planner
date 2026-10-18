# Photo Geometry Planner

Experimental static 3D photographic geometry planner using CesiumJS and Astronomy Engine, deployed via GitHub Pages.

## Features

- Place a camera by clicking on the map or entering latitude/longitude. Set estimated ground elevation and adjust AGL / AMSL camera height.
- Visualise rectilinear camera field-of-view frustum, focus plane and approximate depth-of-field volume; optionally switch to a basic camera viewpoint.
- Lens scrubbers for focal length and focus distance (logarithmic scales), and a discrete nominal third-stop aperture selector.
- Camera sensor presets (Nikon D850, Nikon FE, Nikon DX, Pentax 67) and configurable circle of confusion under **Camera format & optical assumptions**.
- Aim at the Sun, Moon, galactic core, or a user-defined point. Custom target placement supports coordinate entry, map picking, and independent ground/AGL/AMSL height controls.
- Astronomical directional markers and schematic 24-hour trajectories for each celestial object, with dashed below-horizon segments; date, time and UTC offset controls.
- Local browser settings, shareable URLs and configuration JSON export/import.

The trajectories are **directional diagrams on a nearby virtual sky shell**, not physical-distance orbital paths. Terrain elevations are approximate. The simulator makes no photorealistic exposure or obstruction claims.

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
node --check app.js
```

The camera projection and astronomical visualisations still require browser testing with live Cesium/CDN connectivity.
