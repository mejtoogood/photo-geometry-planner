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

The camera preview uses the same unrolled viewing direction as the 3D FOV, while **roll rotates the sensor rectangle over the level Cesium scene**. The 3D planning frustum still includes sensor roll. Celestial locations in camera view are screen-space markers derived from angular direction, not line segments extending towards the sky shell. The shell and its 24-hour arcs continue to appear only in planning view. The outlined camera frame uses the selected sensor FOV and is calibrated to the Cesium viewport's margins.

## Long-distance planning view

For projection extents above **1 km**, the tool switches automatically to wireframe geometry. Extremely large translucent polygons across a Google Photorealistic 3D scene previously obscured the terrain. The FOV extent, optical calculations, and focus distances are unchanged, but the projected FOV/DOF/focus surfaces are drawn as outlines only. Schematic celestial markers and the 24-hour trajectory arcs remain visible; redundant rays extending all the way from the camera to each celestial marker are removed. Camera view uses a separate angle-based overlay. Sensor roll rotates the viewfinder rather than the terrain.

## Google 3D surface heights

When the Google Photorealistic 3D Tiles layer is active, clicking to place a camera or target now **preserves the clicked mesh surface height**, instead of overriding it with Cesium World Terrain. Resampling explicitly queries the Google 3D Tiles mesh using `scene.sampleHeightMostDetailed`, then falls back to Cesium World Terrain only if no Google surface can be sampled. The elevation source is shown beside the camera/target height fields. A photogrammetry mesh may return roof/tree elevation rather than bare ground; the values remain manually editable. Google 3D camera views close to the surface may still show mesh artefacts where models are imperfect.

## Viewfinder rendering fix (v1.0)

The previous camera-view toggle attempted to size its camera frame while `hidden` was still set, yielding a zero-size measurement and throwing during focal-length FOV calculation. It now reveals the frame before updating the Cesium camera. The frame's pixel dimensions are explicitly fit within the available scene using the sensor aspect ratio, with the Cesium perspective calculated to make the outlined sensor rectangle correspond to the lens field of view. A stronger viewfinder border, corner markings, crosshair, rule of thirds and live focal/aperture/FOV/heading/roll readout make it obvious when camera view is active. Cesium's map legend/instructions are suppressed in viewfinder mode.

## Camera view navigation (v1.1)

Dragging inside **Basic camera view** now pans the simulated photographic camera: it updates the planner's heading and pitch controls, then renders the Cesium viewpoint and celestial marker positions from the same orientation state. Cesium's ordinary orbit/translate/tilt controls are temporarily disabled only in camera view, so the camera cannot drift independently of its projected FOV. The viewfinder contains clipped screen-space 24-hour Sun, Moon, and galactic-core trajectories with dashed segments below the horizon (subject to their visibility toggles). Both roll reset buttons have been removed; roll remains editable numerically. The viewfinder shading is clipped to the 3D map pane and no longer overlays the left-side controls.

## Surface-projected Sun/Moon azimuth bearings (v1.2)

**3D planning view** includes six independently calculated ground bearing rays: Sun rise, set and current azimuth; Moon rise, set and current azimuth. Lines originate at the placed camera's latitude/longitude, are laid out as WGS84 initial-bearing geodesics and are draped onto Cesium terrain and the Google Photorealistic 3D mesh where supported (`PolylineGraphics.clampToGround`, `ClassificationType.BOTH`). They show azimuth on the visible surface, **not** a ray to the actual celestial object. Rise/set directions are calculated for the selected local calendar day and UTC offset using Astronomy Engine `SearchRiseSet`, with object azimuth evaluated at each exact event. If an event is absent that day, it is omitted rather than fabricated. Current-bearing rays are thicker, solid above the horizon and dashed below. The ground-ray length is adjustable from 100 m to 50 km independently of the FOV projection extent and celestial sky-shell radius; line settings persist in the existing share/save configuration. Rays appear only in 3D planning view. The rising/setting bearings use a standard astronomical horizon and don't account for nearby mountain/building obstructions; clamping to photogrammetry may have visual limitations.

## Target and reciprocal rise/set alignment rays (v1.3)

Section **4 · Target** is dedicated to a user-designated physical subject. Set latitude/longitude manually or click the 3D map, adjust target ground elevation and height AGL/AMSL, and use **Aim camera at target**. These controls are always available. The separate Sun/Moon/galactic core *Aim* buttons remain in the astronomy section.

Four event toggles (Sun rise/set, Moon rise/set) control the target's ground-projected daily alignment bearings. For each event, **both directions** are available:

- **Towards Sun/Moon:** a solid line in the body's colour, projecting its rising/setting azimuth outward from the target.
- **Candidate camera positions:** a dashed teal line extending from the target along the reciprocal bearing (celestial bearing + 180° modulo 360°). This is where a photographer could stand to put the body behind the target in azimuth.

The event table shows time at the selected UTC offset, celestial azimuth, and reverse candidate-camera azimuth. Calculations use the **target's coordinates and AMSL height**, not the camera position, and the date selected in the astronomy controls. The target alignment length and visibility switches are independent from camera-centred ground bearings, all persisted to saved settings/share URLs. Rays clamp to terrain/Google 3D where supported and appear only in 3D planning view. These are **horizontal alignment guides**: height differences, terrain obstructions, the Sun/Moon's elevation and apparent disc size are not solved by the lines. A missing daily event is displayed as unavailable, without drawing a fictitious ray.

## Sensor roll vs world camera orientation (v1.4)

Roll affects the physical camera's sensor plane, so the **basic camera view keeps terrain and horizon level** while drawing the sensor rectangle rotated around the optical axis. The Cesium view camera always uses the unrolled ENU-derived direction and up vector. The rectangle rotates by the inverse CSS angle to match the ENU sensor basis; Sun/Moon/galactic-core positions and trajectories are still computed in rolled sensor coordinates so they stay fixed relative to the underlying scene instead of orbiting the screen as roll changes. At nonzero roll the sensor rectangle is resized to fit the viewport's rotated bounds without clipping its corners. Mouse panning always changes geographic heading/elevation independent of the selected sensor roll. The 3D planning view continues showing roll via its FOV geometry.
