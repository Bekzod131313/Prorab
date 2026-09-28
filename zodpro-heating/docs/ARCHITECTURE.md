# ZODPRO Heating BIM — Architecture

## 1. Layers

```
UI (src/ui)                 ribbon, browser, properties, 2D canvas editor, 3D viewer, drawings, sheets
  ↓ commands / transactions
Application (src/core/store.js, app.js)   Store: project state, undo/redo, selection, events, autosave
  ↓
Domain / BIM model (src/core/model.js)    elements, levels, connectors, marks, integrity
  ↓ pure functions
Engineering engines (src/engines)         heat loss, radiator, UFH, network, hydraulics, equipment, BOM, validation
  ↓
Persistence (src/core/io.js)               .zph (versioned JSON + migrations), DXF, IFC4, SVG, CSV, Excel
  ↓
Integration (src/core/integrations.js)     ERP/SAP connector, Telegram, plugins, roles, API contract
```

Rules: engines never touch the DOM; UI never computes engineering values; every model change is a
transaction (`Store.apply`) that triggers the calculation pipeline.

## 2. Technology decisions

| Area | Choice | Why | Alternatives | Trade-offs / risks | Licence |
|---|---|---|---|---|---|
| Language | Modern JavaScript (ES modules), JSDoc | Runs in any browser and in Node for tests without a build step; one language for UI and engines | TypeScript, C#/.NET (Revit-like desktop), C++/Qt | No compile-time types (mitigated by tests); TypeScript migration is mechanical later | — |
| App shape | Static web app (desktop via Tauri later) | Zero install, offline-capable, same code for web/mobile viewer | Electron, native desktop | Browser memory limits for very large models → PERF-01 | — |
| 2D rendering | HTML Canvas 2D (own CAD engine) | Full control of snapping, grips, tags; fast for 10k segments | SVG DOM, Paper.js, Konva | Hand-written hit testing | — |
| 3D rendering | three.js r160 (vendored) | Mature WebGL, clipping, raycasting | Babylon.js, xeokit (BIM) | Heavy BIM (1M triangles) needs instancing → PERF-01 | MIT |
| Geometry | Own 2D kernel (`util.js`, `geometry-ops.js`) | Needs are orthogonal/planar; no dependency | clipper-lib, JSTS, OpenCascade.js | Complex booleans (UFH offsets) → UFH-02 may add clipper (BSL) | — |
| Calculation | Deterministic pure functions, versioned (`*_VERSION`) | Testable, reproducible, worker-ready | Server-side solver | — | — |
| Storage | `.zph` = JSON with schema version + checksum; localStorage autosave | Human-diffable, migratable | SQLite (sql.js), IndexedDB | Large embedded underlays inflate files | — |
| Tests | `node:test` | No dependencies, CI-friendly | Jest, Vitest | Fewer helpers | — |
| QR | qrcode-generator (vendored) | Tiny, MIT | — | — | MIT |
| PDF underlay | pdf.js (loaded on demand from CDN) | Standard PDF renderer | — | Needs network the first time | Apache-2.0 |

## 3. Calculation pipeline & dependency graph

`engines/calc.js` exports `DEPENDENCY_GRAPH` and `runCalculation(project)`:

```
room/wall/opening/level/climate ─► heatLoss (cached per room by input hash)
heatLoss + UFH settings ─► ufh (base load)          heatLoss − ufh ─► radiators (auto/manual selection)
radiators + pipes + risers + equipment ─► network (graph, trees, loops, disconnections)
network + loads ─► flows ─► pipe sizing ─► hydraulics per edge ─► circuits ─► balancing
circuits ─► pump (critical path × margin)      heatLoss + DHW ─► boiler      volumes ─► expansion
everything ─► clashes ─► BOM ─► cost ─► validation (24 rules) ─► dashboard / documents
```

Parametric follow-up: when automatic radiator selection changes the product length, `syncRadiatorGeometry`
moves the radiator connectors and drags attached pipe ends inside the same undo step.

## 4. Data model (high-level schema)

`.zph` → `{ schema, meta, settings, levels[], elements{}, revisions[], issues[], history[], library?, warehouse?, clashStatus? }`

Element categories: `wall, window, door, room, radiator, pipe, riser, collector, boiler, pump,
thermostat, obstacle, text, dim, dline, circle, section`. Every element: `id, guid, cat, levelId, mark, custom{}`
+ category parameters. Connectors are *derived* (never duplicated) from equipment geometry.

Server database (CLOUD-01) maps 1:1: Projects, Buildings, Levels, Rooms, Walls, Doors, Windows, Floors,
Ceilings, Materials, Radiators, Pipes, Fittings, Valves, Collectors, Boilers, Pumps, Equipment, Systems,
Connectors, Calculations, Schedules, Sheets, Users, Roles, Revisions, Products, Suppliers, Prices, Stock,
Rules, Issues — keyed by element GUID; project JSON stays the exchange format.

## 5. Engineering engine references

| Engine | Method | Test |
|---|---|---|
| Heat loss | U·A·ΔT·(1+Σβ)·n; ρ·c·L·ΔT; ground zones 2.1/4.3/8.6/14.2 | box room hand calc, zone areas |
| Radiator | EN 442 characteristic, LMTD, exponent n | LMTD, correction factor, 1265 W example |
| Hydraulics | Darcy–Weisbach, Swamee–Jain (±3 % Colebrook), laminar 64/Re, ζ, Kv | Colebrook comparison, v, R |
| Sizing | smallest DN meeting v_max, R_max, DN range | DN20 at 0.2 m³/h |
| Balancing | lockshield preset closest to critical Δp | all circuits ±15 % |
| Pump | system curve ∩ pump curve, speed ratio | operating point on both curves |
| Boiler | (Q·(1+loss) + DHW·k)·reserve, DHW priority | 15 kW → 18 kW |
| Expansion | EN 12828 Annex D | 100 l system → 12.15 l → 18 l |
| UFH | EN 1264 characteristic, K_H by spacing, loop limits | surface temperature 100 W/m² → 29 °C |

## 6. Repository structure

```
zodpro-heating/
  index.html, css/app.css
  src/core      model, store (transactions), io (formats), autodesign, assistant, integrations, i18n, templates, demo
  src/engines   heatloss, radiator, ufh, network, hydraulics, equipment, bom, validation, calc (pipeline), water
  src/data      climate, materials/assemblies, products (demo catalogue)
  src/ui        app shell, plan2d, view3d, panels, reports, schematic, sheets, pages, geometry-ops, icons
  vendor        three.js r160, qrcode-generator (offline)
  tests         engines (known values), integration (benchmark), core (formats/transactions/geometry)
  docs          REQUIREMENTS_MATRIX, ARCHITECTURE, BACKLOG
```

## 7. Build, CI, release

No build step. `npm test` runs all tests (Node ≥ 20). CI: `.github/workflows/zodpro-heating.yml`.
Semantic versioning in `package.json`; channels dev → beta → stable; desktop installer → REL-01.
