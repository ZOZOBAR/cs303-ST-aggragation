# AGGRE/GATE

CS303 Show & Tell — a 3D data archive that visualizes a **MongoDB aggregation pipeline**, built with Next.js (App Router) and three.js.

Every card is a document. Step through the pipeline and watch the collection turn into an answer:

| Stage | What happens on screen |
|---|---|
| collection | Cards stand on the floor, unordered |
| `$match` | Cards that fail `year ≥ 2000` sink into the floor |
| `$unwind` | Each card gets the colour of its genre |
| `$group` | Cards are filed into racks — rack length = count |
| `$sort` | Racks are re-shelved, biggest first |
| `$limit` | Only the top 5 racks stay lit |
| click a rack | Runs a second pipeline (`$match → $sort → $limit`) for that genre |

## Setup

1. In MongoDB Atlas, load the sample data: **Cluster → … → Load Sample Dataset** (this creates `sample_mflix`).
2. Create `.env.local` in the project root:

   ```
   MONGO_URI=your-mongodb-connection-string
   ```

3. Install and start:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:3000

Without `MONGO_URI` the page still runs with demo data, so the visuals can be worked on without a database.

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
  getArchiveData.ts     Aggregation pipelines for the page ($group counts + $sample of cards)
  getTopMovies.ts       Server Action for the drill-down query
  demoData.ts           Fallback data when no database is set
  types.ts              Shared TypeScript types
db.ts                   MongoDB connection helper
```

## How the data is loaded

- `page.tsx` is a server component. It calls `getArchiveData()`, which runs the real pipeline (`$match → $unwind → $group → $sort`) and a `$sample` of documents to draw as cards.
- The page uses ISR (`revalidate = 3600`): it is regenerated at most once an hour instead of querying the database on every visit.
- Clicking a rack calls the `getTopMovies()` Server Action, which runs a new pipeline on the server and returns only the fields the client needs.
