import getCollection, { hasDatabase, MOVIES_COLLECTION } from "@/db";
import { ArchiveData } from "@/lib/types";
import { CARD_COUNT, GENRE_COUNT, YEAR_FROM } from "@/lib/pipeline";
import { makeDemoArchive } from "@/lib/demoData";

// Runs on the server when the page is rendered.
// Uses aggregation pipelines to get everything the 3D archive needs.
export default async function getArchiveData(): Promise<ArchiveData> {
    if (!hasDatabase()) {
        return makeDemoArchive();
    }

    try {
        const movies = await getCollection(MOVIES_COLLECTION);

        // 1. The real pipeline: $match → $unwind → $group → $sort
        //    (we keep the top GENRE_COUNT groups as racks; the page shows $limit visually)
        const groups = await movies.aggregate<{ _id: string; count: number }>([
            { $match: { year: { $gte: YEAR_FROM } } },
            { $unwind: "$genres" },
            { $group: { _id: "$genres", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: GENRE_COUNT },
        ]).toArray();

        // Racks start in alphabetical order; the $sort stage reorders them on the page
        const sortedGroups = [...groups].sort((a, b) => a._id.localeCompare(b._id));
        const genres = sortedGroups.map((group) => group._id);
        const counts = sortedGroups.map((group) => group.count);

        // 2. A random sample of documents to draw as cards.
        //    $unwind first, so each card is one (movie, genre) pair like after the real $unwind.
        const sample = await movies.aggregate<{ _id: unknown; genres: string; year: number }>([
            { $match: { year: { $type: "number" }, genres: { $in: genres } } },
            { $unwind: "$genres" },
            { $match: { genres: { $in: genres } } },
            { $sample: { size: CARD_COUNT } },
            { $project: { genres: 1, year: 1 } },
        ]).toArray();

        // Keep the _id (as a string) so a single card can be opened later
        const cards = sample.map((doc) => ({
            id: String(doc._id),
            genre: genres.indexOf(doc.genres),
            pass: doc.year >= YEAR_FROM,
        }));

        // 3. Counts for the info panel
        const total = await movies.countDocuments();
        const matched = await movies.countDocuments({ year: { $gte: YEAR_FROM } });

        return { genres, counts, cards, total, matched, source: "mongodb" };

    } catch (error) {
        // If the database cannot be reached, keep the page working with demo data
        console.error(error);
        return makeDemoArchive();
    }
}
