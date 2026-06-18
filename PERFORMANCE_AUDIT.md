# Prorab — Production Performance Audit

Scope: `flutter_app/lib/**`. No UI/behavior changes made — findings only, with file:line references. Target: 60fps minimum, instant navigation, smooth scrolling, minimal loading states.

Verified directly: `pubspec.yaml` has **no state-management package** (no provider/riverpod/bloc) and **no image-caching package** (no `cached_network_image`) — confirms findings in sections 3 and 4.

---

## 1. Unnecessary rebuilds

| # | Location | Issue | Impact |
|---|----------|-------|--------|
|1.1| `dashboard_screen.dart:180` `onPageChanged: (i) => setState(() => _currentPage = i)` inside a 516-line `build()` (lines 117-517) | Every PageView swipe re-runs the entire dashboard build (hero card, gradient, info card, buttons) just to move 1 indicator dot | Janky swipe, wasted CPU every frame of the swipe gesture |
|1.2| `dashboard_screen.dart:282-291` page indicator dots built via `List.generate` inside the same `setState` scope | Indicator should be its own small widget (e.g. `ValueListenableBuilder` on a `ValueNotifier<int>`) | Same root cause as 1.1 |
|1.3| `project_detail_screen.dart` — state class with a **1217-line build method**; filter chips (`_FilterChip` taps around line 901-905) call `setState(() => _txFilter = ...)` | Switching the Kirim/Chiqim/All filter rebuilds the balance card, tab bar, action buttons, member list — everything — to re-filter one list | Visible jank on every filter tap |
|1.4| `profile_screen.dart:32-50` `_load()` always does `Future.wait([loadCurrent, loadStats, loadPortfolio])`, called after any single mutation (e.g. avatar upload) | Triggers 3 queries + full-screen rebuild to reflect a 1-field change | Slow perceived response after upload actions |

**Root cause common to all four:** the app has no widget-level state isolation — one `setState` at the top of a screen invalidates the whole subtree. Fix direction (not implemented yet): extract hot regions (indicator dots, filtered list, balance card) into their own small `StatefulWidget`/`ValueListenableBuilder` so `setState` calls don't escape their own scope.

---

## 2. Database queries (Supabase)

| # | Location | Issue | Impact |
|---|----------|-------|--------|
|2.1 **(critical)**| `transaction_repository.dart:5-14` `loadForProject()` | No `.limit()`/`.range()` — fetches **every** transaction row for a project, forever growing | Memory + parse time grows unbounded with project age; first thing to fix |
|2.2| `transaction_repository.dart:8,139,157` | `select('*')` everywhere, including a full-row fetch in `deleteTransaction()` (line 157) just to read a few fields | Extra bytes over the wire on every call |
|2.3| `analytics_screen.dart:35-39` | One `loadForProject()` call **per owned project** in a `.map()` — classic N+1 | For a user with 10 projects: 10 round trips instead of 1 `inFilter` query |
|2.4| `profile_repository.dart:92-107` `loadStats()` | Loads all projects, sums in Dart, then a separate `ob_members` query per call (not aggregated server-side) | Should be a single SQL aggregate (`count`/`sum`) via RPC or a view |
|2.5| `worker_repository.dart:22-26` | `select('*,profiles(*)')` pulls full profile rows (avatar URLs, phone, etc.) just to list worker names | Unneeded payload size on a screen that only renders names |
|2.6| `transaction_repository.dart:43-44,71-72,163-164` | `.single()` (not `.maybeSingle()`) on rows that could be absent (e.g. after a row was deleted concurrently) | Throws an uncaught Supabase exception instead of returning null — a likely source of the "red crash screen" class of bugs already seen in this app |
|2.7| `dashboard_screen.dart` `_load()` re-run on every return from `ProjectDetailScreen` (`.then((_) => _load())`, and same pattern in `projects_screen.dart:274-276`) | Re-fetches the entire project list from scratch even when nothing server-side changed, with no cache | Visible loading flash every time the user backs out of a project |

**Theme:** there is no caching layer at all between screens — every navigation back to dashboard/projects re-hits Supabase. Combined with no pagination on transactions, this is the single biggest risk to "instant navigation."

---

## 3. Image optimization

| # | Location | Issue |
|---|----------|-------|
|3.1| `dashboard_screen.dart:200-202` hero card | `NetworkImage` for a ~220px box, no `cacheWidth`/`cacheHeight` |
|3.2| `projects_screen.dart:384-388` project list cards | Same — full-res image decoded for a 200px-tall card |
|3.3| `project_detail_screen.dart:728-735` | `Image.network` for a 160px header, no memory cache sizing |
|3.4| `profile_screen.dart:311-315` portfolio grid (3-up) | Full-res thumbnails, no `cacheWidth` |
|3.5| `profile_screen.dart:196` avatar circle | `NetworkImage`, no sizing hint |
|3.6| `pubspec.yaml` | No `cached_network_image` (or similar) dependency — Flutter's default `ImageCache` is in-memory only and is evicted on app restart, so every cold start re-downloads every image again |

**Impact:** every list/grid of images (project list, portfolio, dashboard hero) decodes full-resolution JPEGs/PNGs at small display sizes — this is a classic cause of jank during scroll and high memory usage, and directly works against "smooth scrolling" and "minimal loading states" (images flash in from network on every screen visit instead of being served from disk cache).

---

## 4. State management

- No state-management package in `pubspec.yaml` — 100% `StatefulWidget` + `setState`.
- `main.dart`: `late final SupabaseClient supabase;` is a bare global, accessed directly from every repository — works, but means there's no central place to hold/share already-fetched data (no shared "project list" or "current user" cache reachable from multiple screens without re-querying).
- This absence is *why* sections 1 and 2 are structurally hard to fix piecemeal: rebuild scoping and cross-screen caching both want some form of shared, listenable state (`ValueNotifier`, `ChangeNotifier`, or a real state package) that this app doesn't have yet.

---

## 5. Memory leaks

Checked every `TextEditingController` / `TabController` / `PageController` / `ScrollController` for a matching `dispose()`, and searched for `StreamSubscription`/`StreamBuilder` (none exist — app is pull-based only, no realtime subscriptions to leak).

**Result: no leaks found.** `dashboard_screen.dart` (PageController), `project_detail_screen.dart` (TabController + per-dialog TextEditingControllers), `projects_screen.dart` (search controller), and `auth_screen.dart` (3 controllers) all dispose correctly.

One soft spot worth flagging: in `project_detail_screen.dart`'s `_openAddTransaction`, controllers are disposed *after* `showModalBottomSheet` returns, with no `try/finally` — if an exception were thrown between creation and the dispose call, the controller would leak. Low risk today (no such path currently throws), but fragile.

---

## 6. Navigation performance

| # | Location | Issue |
|---|----------|-------|
|6.1| `dashboard_screen.dart:110-113` | `await Navigator.push(...)` followed immediately by a blocking `_load()` on return — the dashboard sits on a loading state right as the back-transition plays |
|6.2| `projects_screen.dart:274-276` | Same pattern: push, then immediate synchronous reload |
|6.3| `project_detail_screen.dart` `_openAddTransaction` | The bottom sheet awaits the Supabase write (and several follow-up reads/writes for member balances) *before* closing/dismissing — the modal close feels delayed rather than instant |

Good news: navigation itself uses plain `MaterialPageRoute` everywhere — no custom transition overhead.

---

## 7. Scrolling performance

| # | Location | Issue |
|---|----------|-------|
|7.1| `project_detail_screen.dart` (txs/members/files lists) | Already use `ListView.separated`/builder pattern — **fine, no change needed** |
|7.2| `worker_detail_screen.dart:125,181` | `List.generate` (eager, builds all items up front, no `ListView.builder`) for project list and payment history, no keys |
|7.3| `dashboard_screen.dart:282-291` | Page-indicator dots via `List.generate`, no explicit keys — minor, but ties back to 1.1/1.2 |
|7.4| `profile_screen.dart:284-317` | `GridView.builder` is correctly lazy, but item widgets aren't `const` and have no `key` |
|7.5| `project_detail_screen.dart` category picker (≈301-323) | Category tiles in the expense dialog rebuilt non-const on every tap |
|7.6| `auth_screen.dart`, `projects_screen.dart` filter chips | `SingleChildScrollView` used for genuinely small/bounded content — **fine as-is** |

Net: scrolling is mostly fine for the *long* lists (transactions, members, files already use lazy builders). The fixable items are the smaller fixed-size lists (`worker_detail_screen` history, dots, category tiles) that don't use `const`/keys and get needlessly rebuilt by surrounding `setState` calls.

---

## Prioritized fix order (recommendation, not yet implemented)

1. **2.1** — add `.limit()`/pagination to `loadForProject()` (unbounded growth, highest risk).
2. **2.6** — swap risky `.single()` calls to `.maybeSingle()` + null handling (crash risk, ties to prior bug reports).
3. **3.1-3.6** — add `cacheWidth`/`cacheHeight` to every `Image.network`/`NetworkImage`, and add `cached_network_image` for disk-persistent caching across cold starts.
4. **1.1-1.3** — scope `setState` calls: extract page-indicator and filter-chip state into small isolated widgets so screen-wide rebuilds stop happening on minor interactions.
5. **2.3, 2.5** — collapse N+1 query patterns (analytics per-project loop, worker profile over-fetch) into single `inFilter`/aggregate queries.
6. **6.1-6.3** — make post-navigation reloads non-blocking (fire-and-forget with a subtle refresh indicator) instead of holding up the transition.
7. **2.5/2.7 caching** — introduce a minimal shared cache (even a simple in-memory `Map` behind the repositories, or a lightweight `ChangeNotifier`) so dashboard/projects don't re-fetch on every back-navigation.

No UI or code changes have been made. Let me know which items to tackle first.
