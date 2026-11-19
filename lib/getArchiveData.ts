import getCollection, { GAMES_COLLECTION } from "@/db";
import { ArchiveCard, ArchiveData, GenreGroup, SteamGame } from "@/lib/types";
import { DOC_COUNT, GENRE_COUNT, GENRE_PIPELINE, LIMIT, PLAYED_MATCH } from "@/lib/pipeline";

// Server-only, read-only queries against the existing Steam import.
export default async function getArchiveData(): Promise<ArchiveData> {
    const games = await getCollection<SteamGame>(GAMES_COLLECTION);

    // Both branches share match → unwind → group → sort. The result branch
    // executes the displayed limit; the preview supports the existing 10 racks.
    const [aggregation] = await games.aggregate<{
        preview: GenreGroup[];
        result: GenreGroup[];
        stats: { groupCount: number; unwound: number }[];
    }>([
        ...GENRE_PIPELINE,
        { $facet: {
            preview: [{ $limit: GENRE_COUNT }],
            result: [{ $limit: LIMIT }],
            stats: [{ $group: {
                _id: null,
                groupCount: { $sum: 1 },
                unwound: { $sum: "$count" },
            } }],
        } },
    ]).toArray();

    const groups = [...aggregation.preview].sort((a, b) => a._id.localeCompare(b._id));
    const genres = groups.map((group) => group._id);
    const counts = groups.map((group) => group.count);

    // Sample whole documents (before $unwind), so the scene can show the real input:
    // one card per game first, then $unwind splits it into one copy per genre.
    const sample = await games.aggregate<{
        _id: number; genres: string[]; playtimeMinutes: number;
    }>([
        { $sample: { size: DOC_COUNT } },
        { $project: { genres: 1, playtimeMinutes: 1 } },
    ]).toArray();

    // Build the cards: one per (game, genre) copy. All copies of a game start stacked
    // on the same spot; the $unwind stage spreads them apart.
    //   genre >= 0 → one of the preview racks
    //   genre = -2 → a genre outside the preview racks (filtered out at $group on screen)
    //   genre = -1 → the game has no genres, so $unwind drops it
    const cards: ArchiveCard[] = [];
    sample.forEach((doc, docIndex) => {
        const docGenres = Array.isArray(doc.genres) ? doc.genres : [];
        const pass = doc.playtimeMinutes > 0;

        if (docGenres.length === 0) {
            cards.push({ id: String(doc._id), genre: -1, pass, doc: docIndex, copy: 0, copies: 1 });
            return;
        }

        docGenres.forEach((name, copy) => {
            const index = genres.indexOf(name);
            cards.push({
                id: String(doc._id),
                genre: index >= 0 ? index : -2,
                pass,
                doc: docIndex,
                copy,
                copies: docGenres.length,
            });
        });
    });

    const [total, matched] = await Promise.all([
        games.countDocuments(),
        games.countDocuments(PLAYED_MATCH),
    ]);
    const stats = aggregation.stats[0];

    // Let connection/query failures reach Next's dev error reporting, never demo data.
    return {
        genres, counts, cards, total, matched,
        sampled: sample.length,
        unwound: stats?.unwound ?? 0,
        groupCount: stats?.groupCount ?? 0,
        topGenres: aggregation.result,
        source: "mongodb",
    };
}
