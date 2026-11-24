# AGGRE/GATE

CS303 Show & Tell — a 3D data archive that visualizes a **MongoDB aggregation pipeline**, built with Next.js (App Router) and three.js.

The data layer reads a real Steam library from **`steam-analytics.games`** in MongoDB Atlas. Step through the aggregation stages, click a genre rack to query its most-played entries, or click a card to inspect its actual stage document as JSON.

| Stage | Query meaning / current scene |
|---|---|
| collection | One stored document per Steam app; the scene uses the complete collection-stage output |
| `$match` | Keep entries with `playtimeMinutes > 0`; failing cards sink into the floor |
| `$unwind` | Emit one document per genre; stacked copies fan out on screen, while empty genre arrays disappear |
| `$group` | Emit one aggregate document per genre; rack length represents played-entry count |
| `$sort` | Rank by totalMinutes descending, then genre name ascending; rack length remains entry count |
| `$limit` | Keep the actual final 5 groups; all 16 genre racks are shown before this stage |
| click a rack | Return up to 8 played entries in that genre, ordered by playtime descending, then AppID ascending |
| click a card | Show the actual document JSON: genres array before unwind, one genre string after unwind |

## Query presets

Choose an example in the top selector, then click **Run example**. Selection alone does not replace the displayed results. On success, playback stops, card/rack selection clears, and the new example starts at the collection stage. A failed request keeps the previous results with an error message.

| Preset | Filter | Ranking / stages |
|---|---|---|
| Genres by total playtime | `playtimeMinutes > 0` | `totalMinutes` descending; all six stages |
| Genres by game count | `playtimeMinutes > 0` | `count` descending; all six stages |
| Games played at least 10 hours | `playtimeMinutes >= 600` | `totalMinutes` descending; all six stages |
| Terraria: match and unwind | `name: "Terraria"` | Collection → match → unwind only |

The short Terraria example runs exactly:

```js
[
  { $match: { name: "Terraria" } },
  { $unwind: "$genres" }
]
```

It shows 177 input documents, one matching game with a genres array, then four output documents with scalar genre strings. The camera focuses the surviving game after match so its split is easy to inspect. It does not execute hidden group, sort, or limit stages.

The right panel offers **Pipeline** and **Stage JSON** tabs. JSON previews show at most 20 documents and separately state the complete stage count. Clicking a card or rack still opens its corresponding actual document.

## Setup

The Steam library has already been imported into Atlas. Use the existing collection; no sample dataset, re-import, or Steam API calls are needed.

1. Keep the existing `.env.local` configuration. For a new checkout, create it in the project root:

   ```dotenv
   MONGO_URI=your-mongodb-connection-string
   ```

   Database and collection selection are defined in `db.ts`: `steam-analytics.games`. Keep credentials out of version control.

2. Install and start:

   ```bash
   npm install
   npm run dev
   ```

3. Open [localhost:3000](http://localhost:3000).

A working database connection is required. Missing configuration or failed queries surface as errors; there is no demo-data fallback.

## Steam document schema

| Field | Type | Meaning |
|---|---|---|
| `_id` | number | Numeric Steam AppID, not a MongoDB ObjectId |
| `name` | string | Game/app name |
| `playtimeMinutes` | number | Lifetime Steam-recorded playtime in minutes |
| `lastPlayedUnix` | number or null | Last played time in Unix seconds, if available |
| `genres` | string[] | Broad Steam Store genres; may be empty |
| `type` | string or null | Store metadata; not a reliable filter for games versus software |
| `metadataFound` | boolean | Whether Store metadata retrieval succeeded during import |

The default genre ranking uses **total playtime in minutes**; the count preset ranks by qualifying entries. Rack lengths still show **played library entry counts**; sort-stage labels show total minutes separately. A game can contribute to multiple genres, so genre counts and time totals overlap. Default `$unwind` drops empty genre arrays from its output without deleting stored documents.

## Project structure

```
app/
  layout.tsx            Root layout
  page.tsx              Server component: runs the pipelines, passes data to the client
  globals.css           All styles (day / night theme)
components/
  ArchiveApp.tsx        Client state: stage, selected rack, theme, auto-play
  ArchiveScene.tsx      three.js scene: cards, racks, lights, depth of field
  InfoPanel.tsx         Right column: stage explanation or drill-down result
  CodeBlock.tsx         Pipeline code with the current stage highlighted
  StageControls.tsx     Stage number and stage switcher
  TopBar.tsx            Title, theme switch, play button
lib/
  pipeline.ts           Fixed query registry, generated code, and stage descriptions
  getArchiveData.ts     Fixed pipeline prefixes, real stage outputs, and scene-card adaptation
  runQuery.ts           Server Action: validate preset ID and run a read-only example
  getTopGames.ts        Server Action: most-played Steam entries in a genre
  getGame.ts            Server Action: one Steam game by numeric AppID
  types.ts              Shared TypeScript types
db.ts                   MongoDB connection helper
```

## How the data is loaded

`page.tsx` is a server component that calls `getArchiveData()`. The main pipeline is:

```js
db.games.aggregate([
  { $match: { playtimeMinutes: { $gt: 0 } } },
  { $unwind: "$genres" },
  {
    $group: {
      _id: "$genres",
      count: { $sum: 1 },
      totalMinutes: { $sum: "$playtimeMinutes" }
    }
  },
  { $sort: { totalMinutes: -1, _id: 1 } },
  { $limit: 5 }
])
```

The `QUERY_PRESETS` registry in `lib/pipeline.ts` supplies both execution and displayed code. `GUIDED_PIPELINE` aliases the default preset. The server executes only the selected preset's prefixes in a MongoDB `$facet`, sharing the same input. Full genre examples have these six branches; Terraria has only the first three:

| Stage result | Executed prefix |
|---|---|
| `collection` | `[]` |
| `match` | `[$match]` |
| `unwind` | `[$match, $unwind]` |
| `group` | `[$match, $unwind, $group]` |
| `sort` | `[$match, $unwind, $group, $sort]` |
| `limit` | `[$match, $unwind, $group, $sort, $limit]` |

`ArchiveData.queryId` identifies the successfully executed preset. `ArchiveData.stages` contains its real output documents; arrays for stages absent from that preset stay empty and are not shown as executed stages. Counts come from these arrays, card membership from the match output, genre copies from the unwind output, rack values from the group output, and rack ordering/final selection from the sort/limit outputs. JavaScript only adapts results to the existing animation geometry; it does not reimplement the query operators. Every genre group has a rack. Before `$sort`, alphabetical rack placement is a presentation choice because MongoDB does not guarantee `$group` output order.

Results are complete, without sampling. Each branch fetches at most 2,001 documents to detect overflow; if any stage exceeds the supported 2,000-document bound, the server reports an error instead of animating a truncated result. The MongoDB query has a 5-second execution timeout. The browser sends only an allowlisted preset ID to `runQuery()`, never a pipeline, database, or collection name. Unknown IDs are rejected before connecting. Execution failures return a generic message without connection details. These controls are a bounded read-only teaching feature, not an unrestricted query console.

### Shared data contract

`SteamGame` in `lib/types.ts` defines stored field names and units. `GameSummary` and `GameDetail` use TypeScript `Pick` to select fields from that type rather than redefine them. Both server queries and the detail panel use numeric `_id`, `name`, `playtimeMinutes`, and the other selected fields unchanged. Time formatting happens in the panel; the stored values remain minutes and Unix seconds.

`GenreGroup` describes aggregation output: `_id` is a genre name here, with `count` and `totalMinutes`. It is a different document shape from a stored game.

`ArchiveCard` is the scene's drawing model. Its string `id`, rack index, and copy positions are prepared from actual stage outputs for the existing animation. This conversion stays at the scene boundary; it does not change the database schema or game query results. The detail panel uses the numeric AppID to find the stage document, also matching the selected genre after unwind to distinguish copies.

- The initial page uses ISR (`revalidate = 3600`). Clicking Run example executes the selected preset on the server again; subsequent stage clicks replay that returned snapshot without further database requests.
- `getTopGames()` returns numeric `_id`, game name, and playtime minutes as `GameSummary` records. It filters by selected genre and the active preset's match condition, sorts by `playtimeMinutes: -1, _id: 1`, and limits to 8 entries.
- Clicking a card reads `data.stages` directly, without another database request. Before unwind it displays the collection or match document; after unwind it displays that game–genre copy. At group, sort, and limit, selecting a rack or card shows that stage's aggregate document (`_id`, `count`, `totalMinutes`). Groups absent from the final limit output are reported as absent. The standalone `getGame()` action remains available for original-document lookups but is no longer called by the detail panel.
- Database reads happen on the server. No runtime Steam API calls or database writes are performed.

## Visualization semantics

The existing layout, controls, themes, and animation transitions are preserved. Cards are stacked per input game before `$unwind`, then fan out into the copies MongoDB returned. A placeholder keeps a game visible until the stage where it disappears. All genre groups appear at `$group`; `$sort` and `$limit` use the actual returned order and final genre IDs. The scene uses the teammate's expanded palette, cycling only if genres outnumber available colours.

Racks represent aggregate documents, while the cards inside illustrate their contributing games. MongoDB itself emits one document per genre at `$group`, not one per contributing card. Clicking a game card shows its real stage JSON. The Stage JSON tab previews up to 20 actual documents per stage, alongside the full output count.

## Verification

Read-only checks against the imported library passed on 2026-11-18:

| Check | Result |
|---|---:|
| Collection documents | 177 |
| Positive-playtime entries | 101 |
| Rows after match → unwind | 302 |
| Rows after unwind without match | 474 |
| Genre groups before limits | 16 |
| Groups before limit / final groups | 16 / 5 |
| Terraria (`105600`) unwound copies | 4, preserving AppID and playtime |

In the earlier data migration, all 10 preview genre drill-downs and the final top 5 were compared with direct database queries. Invalid AppIDs and repeated-card lookups were also checked. These are snapshot counts, not hard-coded application expectations.

TypeScript (`npx tsc --noEmit --incremental false`), focused ESLint on changed files, and `git diff --check` passed. The existing local dev server returned HTTP 200 with the live Steam source. No production build was run.

On 2026-11-19, the stepwise integration was checked against all six direct MongoDB prefixes: **177 → 101 → 302 → 16 → 16 → 5**. The displayed pipeline was compared with the executed definition. Card membership, per-rack counts, Terraria's four copies, sort order, and final groups passed. An in-memory change to the match predicate confirmed that drawing data follows query output. Empty input and overflow rejection for every stage were checked with a mocked collection.

TypeScript, focused ESLint (including the scene), and whitespace checks passed again. All six stages were clicked in the browser, which reported no console errors; the existing dev page returned HTTP 200. Individual card JSON remains available in the detail panel; the Stage JSON tab now adds bounded intermediate-output previews.

On 2026-11-24, the preset queries and all executed prefixes were checked with read-only Atlas queries:

| Preset | Stage output counts |
|---|---|
| Total playtime | 177 → 101 → 302 → 16 → 16 → 5 |
| Game count | 177 → 101 → 302 → 16 → 16 → 5 |
| At least 10 hours | 177 → 42 → 128 → 16 → 16 → 5 |
| Terraria name match | 177 → 1 → 4 |

Preset-specific drill-downs and rejection of unknown IDs were also checked. Browser checks covered changing presets, resetting from six stages to three and back, stage JSON, and Terraria's array-to-string split. No production build was run.
