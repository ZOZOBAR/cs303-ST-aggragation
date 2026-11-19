# AGGRE/GATE

CS303 Show & Tell — a 3D data archive that visualizes a **MongoDB aggregation pipeline**, built with Next.js (App Router) and three.js.

The data layer reads a real Steam library from **`steam-analytics.games`** in MongoDB Atlas. Step through the aggregation stages, click a genre rack to query its most-played entries, or click a card to load an individual game.

| Stage | Query meaning / current scene |
|---|---|
| collection | One stored document per Steam app; current cards preview sampled game–genre pairs |
| `$match` | Keep entries with `playtimeMinutes > 0`; failing cards sink into the floor |
| `$unwind` | Emit one document per genre; the scene currently recolours cards, with actual splitting pending |
| `$group` | Emit one aggregate document per genre; rack length represents played-entry count |
| `$sort` | Rank by count descending, then genre name ascending |
| `$limit` | Return the top 5 groups; the scene retains up to 10 preview racks before this stage |
| click a rack | Return up to 8 played entries in that genre, ordered by playtime descending, then AppID ascending |
| click a card | Load the game with `findOne({ _id: numericAppId })` |

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

Genre rankings count **played library entries**, not hours. A game can contribute to multiple genres, so genre counts and time totals overlap. Default `$unwind` drops empty genre arrays from its output without deleting stored documents.

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
  pipeline.ts           Stage definitions and pipeline code (shared)
  getArchiveData.ts     Genre aggregation, counters, final results, and sampled game–genre cards
  getTopMovies.ts       Server Action: most-played Steam entries in a genre (legacy filename)
  getMovie.ts           Server Action: one Steam game by numeric AppID (legacy filename)
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
  { $sort: { count: -1, _id: 1 } },
  { $limit: 5 }
])
```

The server shares the first four stages, then uses `$facet` to obtain a 10-group preview, the actual 5-group final result (`topGenres`), and counters before either limit. A facet runs separate branches over the same input. Preview racks are sent in alphabetical order so the existing scene can animate sorting.

A separate query unwinds genres, restricts them to preview racks, and samples up to 900 game–genre pairs. Each card retains `{ id, genre, pass }`: a string AppID for client transport, a preview genre index, and whether playtime is positive. These cards are a compatibility sample, not the full collection or a faithful pre-unwind input.

- The page uses ISR (`revalidate = 3600`), allowing cached pages to refresh at most once an hour.
- `getTopMovies()` retains its existing name for client compatibility but returns Steam game names and playtime minutes. It filters by selected genre and positive playtime, sorts by `playtimeMinutes: -1, _id: 1`, and limits to 8 entries.
- `getMovie()` validates the ID as a positive safe integer and queries numeric `_id`. It returns name, genres, playtime, and last-played time. Invalid or missing IDs return `null`; repeated genre cards resolve to the same game.
- Database reads happen on the server. No runtime Steam API calls or database writes are performed.

## Animation handoff

The data migration preserves `ArchiveScene.tsx`, camera movement, styling, and interactions. The current scene still recolours existing cards at `$unwind`; correct document splitting remains a teammate task.

For that update, supply full input documents with genre arrays: one input with N genres must produce N output cards, preserving AppID and playtime. Empty arrays produce no output with the current pipeline. `$group` then emits one aggregate document per genre, rather than modifying each game card. Keep the 10-rack preview distinct from the 5 final groups and use real intermediate counters rather than sampled card counts.

## Verification

Read-only checks against the imported library passed on 2026-11-18:

| Check | Result |
|---|---:|
| Collection documents | 177 |
| Positive-playtime entries | 101 |
| Rows after match → unwind | 302 |
| Rows after unwind without match | 474 |
| Genre groups before limits | 16 |
| Preview racks / final groups | 10 / 5 |
| Terraria (`105600`) unwound copies | 4, preserving AppID and playtime |

All 10 preview genre drill-downs and the final top 5 were compared with direct database queries. Invalid AppIDs and repeated-card lookups were also checked. These are snapshot counts, not hard-coded application expectations.

TypeScript (`npx tsc --noEmit --incremental false`), focused ESLint on changed files, and `git diff --check` passed. The existing local dev server returned HTTP 200 with the live Steam source. No production build was run.
