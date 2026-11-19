import getCollection, { GAMES_COLLECTION } from "@/db";
import { ArchiveData, GenreGroup, SteamGame } from "@/lib/types";
import { CARD_COUNT, GENRE_COUNT, GENRE_PIPELINE, LIMIT, PLAYED_MATCH } from "@/lib/pipeline";

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

    // Preserve the scene contract only: these are sampled post-unwind pairs.
    // Include unplayed entries so pass still represents the actual match predicate.
    const sample = await games.aggregate<{
        _id: number; genres: string; playtimeMinutes: number;
    }>([
        { $unwind: "$genres" },
        { $match: { genres: { $in: genres } } },
        { $sample: { size: CARD_COUNT } },
        { $project: { genres: 1, playtimeMinutes: 1 } },
    ]).toArray();

    const cards = sample.map((doc) => ({
        id: String(doc._id),
        genre: genres.indexOf(doc.genres),
        pass: doc.playtimeMinutes > 0,
    }));
    const [total, matched] = await Promise.all([
        games.countDocuments(),
        games.countDocuments(PLAYED_MATCH),
    ]);
    const stats = aggregation.stats[0];

    // Let connection/query failures reach Next's dev error reporting, never demo data.
    return {
        genres, counts, cards, total, matched,
        unwound: stats?.unwound ?? 0,
        groupCount: stats?.groupCount ?? 0,
        topGenres: aggregation.result,
        source: "mongodb",
    };
}
