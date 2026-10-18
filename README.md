# Photo Geometry Planner

Experimental static 3D photographic geometry planning tool built using CesiumJS and Astronomy Engine.

Features: select camera location by coordinates or map click, adjust AGL/AMSL height, project field of view and depth of field, select sensor and lens parameters, and display Sun, Moon and Galactic Centre directions for a chosen date and time. Basic camera preview is provided; this is not a photorealistic simulator.

## GitHub Pages

Under **Settings → Pages**, choose **GitHub Actions** as the source. The bundled `.github/workflows/pages.yml` deploys every push to `main`.

Visit https://mejtoogood.github.io/photo-geometry-planner/ after deployment. To enable Google Photorealistic 3D Tiles, enter your Cesium ion token in the app. The token is stored locally in your browser, not the repository.

## Validation

Run `node tests/optics.test.js`. JavaScript syntax is checked with `node --check app.js` and analogous commands. Runtime Google 3D rendering remains to be tested in a browser with Cesium ion access.
