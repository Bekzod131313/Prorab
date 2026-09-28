# Master backlog

Items deferred from this delivery. Each has: why it is deferred, what foundation already exists,
and what it depends on. Nothing here is "nice to have" — it is scheduled work.

| ID | Item | Phase | Why deferred | Foundation already in place | Depends on |
|---|---|---|---|---|---|
| HYD-LOOP | Closed-loop network solving (Hardy-Cross / Newton) | 4 | Current solver is exact for tree (radial/2-pipe dead-end) networks, which cover collector systems; loops need an iterative solver + convergence tests | Graph with loop detection (`network.js`), per-edge Δp(Q) functions | — |
| HYD-03 | Manufacturer Δp curves for valves/radiators/boilers | 4 | Needs manufacturer data | Kv and ζ models; boiler quadratic Δp | LIB-IMP-02 |
| ROUTE-02 | Obstacle-aware routing (A* on grid), ceiling/floor/wall strategies, min-Δp route, user constraints | 2 | Needs spatial index and cost model | Orthogonal router, clash detector | PERF-01 |
| CAD-02 | Chamfer, Align, stretch | 1 | Scope of first drop | geometry-ops (intersection, offset) | — |
| CAD-03 | Line-type / line-weight editor, annotation styles | 6 | — | Category styles in `plan2d.js` | — |
| CAD-04 | Right-click context menu | 1 | — | Command registry | — |
| FAM-01 | Generic family editor (any category, parametric geometry, connectors) | 2 | Needs geometry kernel for families | Radiator family creator, product records | LIB-3D |
| MAT-01 | Assembly/material editor UI | 3 | — | Data-driven `ASSEMBLIES`/`MATERIALS`, per-project `library` override | — |
| ROOM-02 | Room detection for non-orthogonal enclosures (planar graph faces) | 1 | Needs wall-graph face extraction | Ray-cast detection, polygon rooms | — |
| HL-02 | Linear thermal bridges (ψ-values), EN 12831 full method option | 3 | Standard pack decision | Line-based breakdown, standard flag | STD-01 |
| DHW-01 | DHW network (sizing, circulation) | 5 | Heating first | System type on pipes/connectors, boiler DHW load | HYD-LOOP |
| FIT-02 | Reducers / heat exchangers as explicit placed fittings | 4 | — | Tee/elbow ζ, BOM | — |
| BR-01 | Boiler-room objects (hydraulic separator, mixing group, safety group) with clearance envelopes | 5 | — | Mixing on UFH collector, safety group in BOM, clearance rule R18 | FAM-01 |
| UFH-02 | Exact UFH loop geometry (turning radius, per-loop CAD path, lead routing) | 5 | Needs polygon offsetting | UFH engine (loops, length, Δp) + schematic patterns | ROOM-02 |
| EMIT-01 | Wall / ceiling heating emitters | 10 | Future system | Consumer abstraction in network & UFH engine | UFH-02 |
| V3D-02 | Realistic mode (PBR, shadows, AO) | 2 | Performance on low-end devices | three.js scene | — |
| DOC-03 | Tag style editor | 6 | — | Collision-aware labels | CAD-03 |
| DOC-04 | Legends & logo upload on sheets | 6 | — | Sheet system | — |
| DOC-05 | Full user manual / API docs site | 6 | — | In-app help, docs/ | — |
| LIB-3D | glTF product models, preview before placement | 7 | Needs product geometry | Product records, 3D viewer | — |
| LIB-IMP-02 | CSV/Excel importers for boilers, pumps, pipes, valves, suppliers | 7 | — | Radiator importer with validation/duplicates | SUP-01 |
| SUP-01 | Supplier entity, price lists, delivery terms | 7 | — | Product price/currency, warehouse table | — |
| OPT-01 | System-level optimisation (compare layouts: cost, length, Δp) | 10 | Needs ROUTE-02 | Sizing alternatives, BOM/cost | ROUTE-02 |
| AI-LLM | LLM backend for the assistant (explanations, docs drafts) | 9 | Requires API key/server; must never replace calcs | Deterministic intent engine + result quoting | CLOUD-01 |
| INT-DWG | Native DWG read/write | 8 | Proprietary format — needs ODA SDK (licence) or LibreDWG (GPL) decision | DXF R12 export/import | Licensing decision |
| INT-RVT | Revit plugin (ZODPRO ↔ Revit) | 8 | Needs Revit API (.NET) add-in | IFC4 export with GUIDs & property sets | INT-IFC-GEOM |
| INT-IFC-GEOM | Full IFC import (walls/spaces geometry) & federated clash models | 8 | Needs IFC geometry kernel (web-ifc, MPL) | IFC4 export, storeys import | — |
| INT-SAP-ADAPTER | Real SAP OData/RFC adapter | 8 | Needs customer SAP endpoint & credentials | `ErpConnector` interface, `procurement()`, SAP article mapping | CLOUD-01 |
| INT-TG-BOT | Two-way Telegram bot | 8 | Needs server | Message builders + Bot API send | CLOUD-01 |
| INT-FX | Exchange-rate provider plug-ins | 7 | No single hard-coded source by design | Rates table with date/source | — |
| CLOUD-01 | Backend: projects API, auth, sync/versioning/conflicts, backups, DB | 9 | Server infrastructure | `.zph` JSON model, `API_ROUTES` contract, roles | SEC-01 |
| SEC-01 | Authentication, 2FA, encryption at rest, session management, audit | 9 | Requires backend | Client role checks, history log | CLOUD-01 |
| PLUG-02 | Plugin sandboxing (iframe/worker isolation) | 10 | — | Permissioned plugin API | — |
| PERF-01 | Web Worker calculation, spatial index (R-tree), stage memoisation | 4 | Current sizes run in a few ms | Pure, serialisable engines; heat-loss cache | — |
| UI-02 | Free docking/undocking of panels | 1 | — | Resizable/hideable panels, workspace presets | — |
| UNIT-01 | Display-unit conversion (mm/cm, l/s, bar, K) | 1 | — | SI internal model, units in settings | — |
| I18N-02 | Localise remaining document-view strings | 1 | — | `t()` dictionaries uz/ru/en | — |
| STD-01 | Standard packs (SP/GOST/EN/ASHRAE coefficient sets) | 3 | Needs licensed standard texts for verification | Explicit `settings.standard` everywhere | — |
| TPL-02 | Bundled template projects (views/sheets/families) | 6 | — | Settings templates | FAM-01 |
| REL-01 | Desktop installer/updater (Tauri) + rollback | 10 | — | Static build, semver | — |
| OPS-01 | Opt-in remote crash reporting | 9 | Needs endpoint | Local error log with IDs | CLOUD-01 |
| QA-02 | Browser E2E tests in CI (Playwright) | all | — | Smoke scripts used during development | — |
