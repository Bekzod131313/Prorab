# ZODPRO Heating BIM — Product Requirements Matrix

Every section of the master prompt is listed. **Nothing is dropped silently**: items not (fully)
implemented are marked `PARTIAL` or `BACKLOG` with the reason, the foundation that already
exists, and the backlog ID (see [BACKLOG.md](BACKLOG.md)).

Legend — Class: `CORE` · `REQUIRED` · `ADVANCED` · `FUTURE` · `INTEGRATION`.
Status: `DONE` (implemented + tested or verified in the browser) · `PARTIAL` (working subset, gap in backlog) · `BACKLOG` (foundation/API only).

| ID | Requirement | Class | Module (code) | Phase | Status | Notes / gap → backlog |
|---|---|---|---|---|---|---|
| R-001 | Parametric chain architecture → procurement | CORE | `engines/calc.js` `DEPENDENCY_GRAPH` | 0 | DONE | One pipeline: heat loss → emitters → network → flows → sizing → hydraulics → balancing → pump → boiler → expansion → BOM → cost → validation. Any change re-runs it. |
| R-002 | Product scope (2D, 3D, calcs, docs, DB, cost, SAP, AI, cloud, as-built) | CORE | whole app | 0–10 | PARTIAL | Cloud / real SAP / LLM → CLOUD-01, INT-SAP-ADAPTER, AI-LLM |
| R-003 | Project manager: new/open/save/save-as/backup/autosave/recovery/history/revision/meta | CORE | `core/store.js`, `core/io.js`, `ui/app.js` | 1 | DONE | `.zph` native file, `.zph.bak` on migration, localStorage autosave + recovery dialog, project history log, revisions. Archive = download `.zph`. |
| R-004 | Project hierarchy (site/building/levels/systems/views/schedules/sheets) | CORE | `ui/panels.js` browser | 1 | DONE | Roof level = top level (attic coefficient). |
| R-005 | Native file content (geometry, objects, params, connectors, systems, calcs, views, sheets, revisions, DB refs, settings) | CORE | `core/io.js` | 1 | DONE | Calcs are re-derived on load (deterministic); optional cached results. Connectors are derived from geometry (never stored twice). |
| R-006 | Levels (name, elevation, floor type/thickness, height, views; semantic vertical connections) | CORE | `model.js`, risers in `network.js` | 1 | DONE | Risers are graph edges between levels. |
| R-007 | 2D CAD: line, polyline, arc, circle, rect, offset, trim, extend, move, copy, rotate, mirror, array, fillet, align, measure, dimension, text, leader, hatch | CORE | `ui/plan2d.js`, `ui/geometry-ops.js` | 1 | PARTIAL | Chamfer and Align → CAD-02. Fillet is R=0 corner join. |
| R-008 | Shortcuts, snap, grid, ortho, osnap, window/crossing selection, multi-select, layers, undo/redo, command history, palette | CORE | `plan2d.js`, `app.js` | 1 | DONE | Line types/weights per category (fixed styles); user line-type editor → CAD-03. Context menu = right-click cancels (CAD-04 for full menu). |
| R-009 | BIM objects with ID/GUID/type/family/instance/geometry/connectors/params/relationships/system/manufacturer/model/article/mark | CORE | `model.js` | 1 | DONE | Family/type = product records; instance = element. |
| R-010 | Parametric model, dependency graph, type/instance/custom params, family creator | CORE | `calc.js`, `panels.js`, `pages.js` (Oila yaratish) | 1–2 | PARTIAL | Custom radiator families in UI; generic family editor for any category → FAM-01 |
| R-011 | Walls (types) + assemblies (layers, λ, ρ, c, R, fire) | CORE | `data/materials.js` | 1 | DONE | Assembly editor UI → MAT-01 (library is data-driven, per-project override via `project.library`). |
| R-012 | Materials DB (λ, ρ, c, μ, R, fire) | CORE | `data/materials.js` | 1 | DONE | |
| R-013 | Rooms: auto detection + all room data | CORE | `geometry-ops.detectRoom`, `model.js` | 1 | PARTIAL | Auto-detection works for orthogonal enclosures; arbitrary polygons via polygon tool; general polygon detection → ROOM-02. Occupancy → gains setting. |
| R-014 | Climate DB by region + manual override, no hard-coding | CORE | `data/climate.js` | 3 | DONE | Values flagged "verify against standard". |
| R-015 | Heat-loss engine (transmission, vent, infiltration, orientation, safety, breakdown) | CORE | `engines/heatloss.js` | 3 | DONE | Hand-calculated box-room test + ground-zone test. Thermal bridges → HL-02. |
| R-016 | Radiator objects, regimes (75/65…custom), auto/manual selection, reserve, placement, window snap, tags | CORE | `engines/radiator.js`, `autodesign.js`, `plan2d.js` | 3 | DONE | "Required 1265 W" example covered by test. |
| R-017 | Pipe object params & systems (supply/return/UFH/DHW/other) | CORE | `model.js`, `calc.js` | 2 | PARTIAL | DHW network hydraulics → DHW-01 (DHW load already in boiler sizing). |
| R-018 | Pipe drawing, connection, snapping, auto-connect, risers, branches, fittings, segmentation, tagging | CORE | `plan2d.js`, `geometry-ops.teeSplits` | 2 | DONE | |
| R-019 | Auto-routing (shortest/orthogonal/ceiling/floor/wall/min-Δp/constraints) | REQUIRED | `autodesign.autoRoute` | 2 | PARTIAL | Orthogonal radial routing (collector/boiler/risers) done; obstacle-aware A* & alternative strategies → ROUTE-02 |
| R-020 | Connectors (position, direction, size, type, system, constraints, incompatibility) | CORE | `model.connectorsOf`, `network.js` | 2 | DONE | System mismatch is detected & reported. |
| R-021 | Network graph (nodes, edges, branches, loops, source/sink, connectivity, validation) | CORE | `engines/network.js` | 2 | DONE | Loops detected; loop hydraulic solving → HYD-LOOP |
| R-022 | Hydraulic calc (flow, v, R, Δp, fittings, valves, radiator, collector, boiler, balancing valve, Kv/ζ, trace) | CORE | `hydraulics.js`, `calc.js` | 4 | DONE | Manufacturer Δp curves → HYD-03 (Kv/ζ supported). |
| R-023 | Pipe auto-sizing with alternatives, reasons, warnings | CORE | `equipment.sizePipe` | 4 | DONE | |
| R-024 | Velocity control + configurable colours | CORE | `plan2d.js` colour modes, settings | 4 | DONE | |
| R-025 | Pressure loss in Pa/m, Pa, kPa, bar per segment + critical path | CORE | panels / reports | 4 | DONE | |
| R-026 | Fittings (elbow, tee, reducer, coupling, valves, filter, check, balancing, radiator valve, collector, boiler, HX) | CORE | `calc.js`, `bom.js` | 4 | PARTIAL | Reducers/HX as explicit objects → FIT-02 (tees/elbows/valves/collector/boiler contribute to Δp). |
| R-027 | Balancing (required/actual flow, imbalance, valve setting, report, recalculation) | CORE | `calc.js` balancing | 4 | DONE | Test: every circuit within ±15 %. |
| R-028 | Pump selection (Q, H, critical path, DB with curves, operating point) | CORE | `equipment.selectPump` | 4 | DONE | Q-H chart in reports. |
| R-029 | Boiler (load, DHW, reserve, DB) | CORE | `equipment.selectBoiler` | 5 | DONE | |
| R-030 | Boiler room components & maintenance validation | REQUIRED | `bom.js`, `validation.js` R18 | 5 | PARTIAL | Hydraulic separator / mixing groups as placeable objects → BR-01 |
| R-031 | Expansion tank (EN 12828) with breakdown | CORE | `equipment.sizeExpansion` | 5 | DONE | |
| R-032 | Underfloor heating (zones, spacing, loops, length, flow, Δp, surface temp, patterns) | CORE | `engines/ufh.js`, `engines/ufhlayout.js` | 5 | DONE | Real loop geometry: bifilar spiral / serpentine, strips per loop, bending radius, leads to manifold ports; lengths and Δp from the geometry. Non-rectangular rooms use the bounding rectangle (warning) → UFH-02 |
| R-033 | Collectors 2…12/custom, outlet data | CORE | `model.js`, reports | 5 | DONE | |
| R-034 | Mixing unit | REQUIRED | `calc.js` (primary ΔT), BOM | 5 | PARTIAL | Modelled as a property of the UFH collector; detailed 3-way valve hydraulics → BR-01 |
| R-035 | Wall / ceiling heating (future-proof core) | FUTURE | emitter abstraction (`consumers` in network) | 10 | BACKLOG | EMIT-01 — the consumer interface already accepts non-radiator emitters (UFH uses it). |
| R-036 | Controls/thermostats with semantic relationships | REQUIRED | `thermostat` element (`controls[]`) | 5 | DONE | Control logic shown in properties. |
| R-037 | 3D engine (orbit, pan, zoom, section, isolate, hide, transparency, wireframe, shaded, clipping, selection, measure) | CORE | `ui/view3d.js` | 2 | DONE | "Realistic" (PBR/shadows) → V3D-02 |
| R-038 | Heating visualisation (supply/return/UFH, flow arrows, diameter) | CORE | `view3d.js`, `plan2d.js` | 2 | DONE | DHW colours with DHW-01 |
| R-039 | Sections/elevations/axonometry/3D cutaways linked to model | REQUIRED | `schematic.js`, `view3d.js` | 6 | DONE | |
| R-040 | Schematic generated from real topology | CORE | `schematic.schematicSVG` | 6 | DONE | |
| R-041 | Riser diagram | REQUIRED | `schematic.riserSVG` | 6 | DONE | |
| R-042 | Tagging (auto marks, radiator/pipe labels, collision-aware) | CORE | `model.autoMark`, plan labels | 6 | DONE | Tag style editor → DOC-03 |
| R-043 | Schedules with configurable columns | CORE | `ui/reports.js`, `pages.js` | 6 | DONE | |
| R-044 | Material takeoff (exact, waste, purchase) | CORE | `engines/bom.js` | 7 | DONE | |
| R-045 | Cost (material, labour, transport, waste, total) | CORE | `bom.costEstimate` | 7 | DONE | |
| R-046 | Multi-currency with pluggable rate source | REQUIRED | settings.rates | 7 | DONE | Online rate providers → INT-FX |
| R-047 | Supplier DB (contacts, prices, stock, delivery, mapping) | REQUIRED | products + warehouse | 7 | PARTIAL | Supplier entity & UI → SUP-01 |
| R-048 | Product library (hierarchy, records incl. SAP article) | CORE | `data/products.js`, Library view | 7 | DONE | Demo catalogue; import real data. |
| R-049 | 3D product models + preview | ADVANCED | library preview (SVG) | 7 | PARTIAL | glTF product geometry → LIB-3D |
| R-050 | Design rules engine (configurable, OK/Warning/Error/Critical) | CORE | `engines/validation.js` RULES | 4 | DONE | Rules can be disabled; limits in settings. |
| R-051 | Validation checklist + dashboard | CORE | `validation.js`, dashboard view | 4 | DONE | |
| R-052 | Optimisation with alternatives (never silently drop constraints) | ADVANCED | sizing/selection alternatives | 10 | PARTIAL | Whole-system option comparison → OPT-01 |
| R-053 | AI engine (explain, suggest, automate, answer, docs) — never replaces calcs | ADVANCED | `core/assistant.js` | 9 | PARTIAL | Deterministic intent engine done; LLM backend → AI-LLM |
| R-054 | Natural-language commands, ask for missing parameters | ADVANCED | `assistant.js` | 9 | DONE | Uzbek/Russian/English keywords; tests. |
| R-055 | Import DWG/DXF/PDF/JPG/PNG/IFC/RVT, underlay calibration & tracing | INTEGRATION | `io.parseDXF`, underlay tool | 8 | PARTIAL | DXF (LINE/LWPOLYLINE/POLYLINE), image & PDF underlay + calibration done; IFC import reads storeys only (INT-IFC-GEOM); DWG needs ODA/LibreDWG (INT-DWG); RVT only via plugin (INT-RVT). |
| R-056 | Export DWG/DXF/IFC/PDF/Excel/CSV/PNG/SVG | INTEGRATION | `core/io.js`, print CSS | 8 | PARTIAL | DXF R12, IFC4 (semantic + walls/pipes geometry), PDF (print), Excel (SpreadsheetML), CSV, PNG, SVG done; native DWG → INT-DWG |
| R-057 | Revit integration architecture | INTEGRATION | IFC/DXF + API contract | 8 | BACKLOG | INT-RVT |
| R-058 | Documentation package (cover … estimate) | CORE | `ui/sheets.js` | 6 | DONE | |
| R-059 | Sheets A-001/H-001 with title block, views, schedules, legends, revisions | CORE | `sheets.js` | 6 | DONE | Legend block → DOC-04 |
| R-060 | Title block fields | CORE | `sheets.js` | 6 | DONE | Logo = ZODPRO wordmark; image upload → DOC-04 |
| R-061 | Revision control (who/when/what) | CORE | `project.revisions`, undo log | 6 | DONE | |
| R-062 | Clash detection (architecture/vent/electrical/plumbing/structure) with ID/severity/status/assignment | ADVANCED | `validation.clashDetection` | 10 | DONE | Obstacles are modelled as `obstacle` elements (beam/duct/tray/structure/plumbing). Federated model import → INT-IFC-GEOM |
| R-063 | Clearance/maintenance checks | REQUIRED | R18 | 5 | PARTIAL | Front service zone for boiler/collectors; per-product clearance envelopes → BR-01 |
| R-064 | Installation mode (mobile) | ADVANCED | `pages.renderInstall` | 9 | DONE | |
| R-065 | As-built workflow (location, product, photo, comment, installer, date) | ADVANCED | `asBuilt` on elements | 10 | DONE | Actual location = move element in as-built revision. |
| R-066 | QR codes per element | ADVANCED | `app.showQR` (vendored qrcode) | 10 | DONE | |
| R-067 | Issue system | ADVANCED | `project.issues`, Issues view | 10 | DONE | |
| R-068 | Collaboration roles & granular permissions | ADVANCED | `integrations.ROLES`, `can()` | 9 | PARTIAL | Client-side enforcement; server enforcement → CLOUD-01 |
| R-069 | Cloud (sync, versioning, conflicts, permissions, backups) | FUTURE | API contract `API_ROUTES` | 9 | BACKLOG | CLOUD-01 |
| R-070 | Offline mode | REQUIRED | static app, vendored libs | 9 | DONE | Everything but PDF-underlay parsing runs offline. |
| R-071 | Mobile / web viewer | ADVANCED | responsive layout | 9 | DONE | Read-only role "Client". |
| R-072 | Database entities (projects…issues) with GUIDs | CORE | JSON model / `.zph` | 1 | PARTIAL | Server DB schema in ARCHITECTURE.md; implementation → CLOUD-01 |
| R-073 | Parameter system (identity/dimension/engineering/commercial/custom) | CORE | properties panel | 1 | DONE | |
| R-074 | SAP integration abstraction, stock/shortage | INTEGRATION | `ErpConnector`, `LocalWarehouse`, `procurement()` | 8 | PARTIAL | Real SAP adapter → INT-SAP-ADAPTER |
| R-075 | Telegram (material list, status, issues, procurement) | INTEGRATION | `sendTelegram`, dialog | 8 | DONE | Bot ↔ platform two-way → INT-TG-BOT |
| R-076 | Commercial workflow & automatic quotation | REQUIRED | `app.openQuotation`, PO draft | 7 | DONE | |
| R-077 | API architecture with authn/authz | INTEGRATION | `API_ROUTES` contract | 8 | BACKLOG | CLOUD-01 |
| R-078 | Plugin system (manifest, permissions, API, versions, events, commands, UI points) | ADVANCED | `PluginHost` | 10 | DONE | Sandboxing via iframes/workers → PLUG-02 |
| R-079 | Security (auth, 2FA, encryption, audit, sessions) | REQUIRED | audit = history/log | 9 | BACKLOG | SEC-01 (requires server) |
| R-080 | Performance (1000+ rooms, spatial index, caching, incremental) | REQUIRED | heat-loss cache, benchmark test | 1–4 | PARTIAL | 1000-room benchmark test; spatial index & worker → PERF-01 |
| R-081 | Threading (UI / render / calc workers) | REQUIRED | pure engines (worker-ready) | 4 | PARTIAL | PERF-01 |
| R-082 | Undo/redo transactions | CORE | `Store.apply/undo/redo` | 1 | DONE | |
| R-083 | Autosave / recovery | CORE | `Store.autosave`, recovery dialog | 1 | DONE | |
| R-084 | Templates (UZ, house, apartment, school, office, boiler room, UFH) | REQUIRED | `core/templates.js` | 6 | PARTIAL | Settings templates; bundled template projects → TPL-02 |
| R-085 | Standards set, never mixed | CORE | `settings.standard` printed on every report | 3 | PARTIAL | Standard-specific coefficient packs → STD-01 |
| R-086 | Units (mm…K) global & per project | REQUIRED | SI internally, labels | 1 | PARTIAL | Unit conversion UI → UNIT-01 |
| R-087 | Localisation uz/ru/en, no hard-coded strings | REQUIRED | `core/i18n.js` | 1 | PARTIAL | Core UI/messages localised; remaining view texts → I18N-02 |
| R-088 | Revit/CAD/engineering-like UI, themes, dockable panels, presets, palette, search, filter | CORE | `ui/*` | 1 | DONE | Panels resize/hide (double-click splitter), workspace presets. Free docking/undocking → UI-02 |
| R-089 | Family system | CORE | products (type) + elements (instance) | 2 | PARTIAL | FAM-01 |
| R-090 | Product importer (CSV) with validation & duplicates | REQUIRED | `io.importRadiatorCSV` | 7 | PARTIAL | Radiators; other categories → LIB-IMP-02 |
| R-091 | Search / filter / bulk selection / global edits trigger recalculation | CORE | Filter tab, multi-edit | 1 | DONE | |
| R-092 | Engineering reports (heat loss, hydraulic, pump, boiler) | CORE | `reports.js` | 6 | DONE | |
| R-093 | Testing (unit/integration/regression/benchmark/known-value) | CORE | `tests/*.test.js` (40 tests) | all | DONE | Browser E2E in CI → QA-02 |
| R-094 | Engineering validation vs hand calcs & versioned calcs | CORE | known-value tests, engine versions | all | DONE | |
| R-095 | Error logging & crash reporting | REQUIRED | `ERROR_LOG`, window handlers | 1 | DONE | Remote crash upload (opt-in) → OPS-01 |
| R-096 | Telemetry only with consent | REQUIRED | opt-in toggle, nothing sent | 9 | DONE | No collector implemented (nothing leaves the device). |
| R-097 | Help / user manual / engineering reference / API & dev docs / release notes | REQUIRED | Help view, docs/ | 6 | PARTIAL | Full manual → DOC-05 |
| R-098 | Development architecture decisions with tradeoffs | CORE | [ARCHITECTURE.md](ARCHITECTURE.md) | 0 | DONE | |
| R-099 | Layered architecture | CORE | `core` / `engines` / `ui` / `data` | 0 | DONE | |
| R-100 | Calculation engine deterministic, versioned, traceable, UI-independent | CORE | `engines/*` | all | DONE | |
| R-101 | Dependency graph + incremental recalc | CORE | `DEPENDENCY_GRAPH`, cache | 1 | PARTIAL | Stage-level memoisation beyond heat loss → PERF-01 |
| R-102 | Data integrity (orphans, dup GUIDs, refs, system membership, stale results) | CORE | `integrityCheck`, `repairReferences`, cascade delete | 1 | DONE | |
| R-103 | Versioning / migrations / backup before migration | CORE | `io.MIGRATIONS` | 1 | DONE | Tested v1→v3. |
| R-104 | Release engineering (builds, semver, installer, rollback) | REQUIRED | `package.json` semver, CI tests | 10 | PARTIAL | Desktop installer (Tauri/Electron) → REL-01 |

## Completeness check (this delivery)

- [x] Scope covered — every section listed above
- [x] Dependencies covered — `DEPENDENCY_GRAPH`, backlog dependencies
- [x] Data model covered — `core/model.js`, ARCHITECTURE.md §4
- [x] UI covered
- [x] Algorithm covered — engines with formulas in code comments
- [x] Validation covered — 24 rules
- [x] Error handling covered — error log, file errors, calc errors surfaced in UI
- [x] Testing covered — 40 automated tests + browser smoke test
- [ ] Performance covered — **INCOMPLETE**: no Web Worker / spatial index yet (PERF-01)
- [ ] Security covered — **INCOMPLETE**: server-side auth/2FA/encryption require the cloud backend (SEC-01)
- [x] Documentation covered (in-app help + docs/)
- [x] Import/export covered (with DWG/RVT gaps recorded)
- [x] Future integration preserved (ERP, plugin, API contracts, emitter abstraction)
- [x] No requirement silently dropped

## Sample-project parity (ISSO reference sheets)

| Reference sheet | Implemented in | Status |
|---|---|---|
| 1-этаж зона теплого пола (loop tags `1.2.3 · Ø16 · L=53 м`, T1/T2 legend) | `ui/annotate.js` `ufhLoopTags`, `ui/drawingsvg.js` `planSVG(...,'ufh')` | done |
| 2-этаж трасса отопления (in-floor convectors `300·120·L … Вт`, towel dryer «Сушилка», risers T5/T6) | `data/products.js` convectors/towel, `planSVG(...,'radiator')` | done |
| Схема теплого пола (isometric, Ø labels) | `ufhAxoSVG` | done |
| Узел подключения коллектора (3D + numbered parts spec) | `ui/detail3d.js`, `engines/bom.js` `manifoldNodeParts` | done |
| Grid axes 1…n / А…, dimension chains, positions, GOST title block | `autoGrid`, `positions`, `ui/sheets.js` | done |
| 3D cut with solid wall sections (poché) | `ui/view3d.js` `buildWall` | done |
| DHW storage tank / boiler-room piping | — | backlog DHW-01, BR-01 |
