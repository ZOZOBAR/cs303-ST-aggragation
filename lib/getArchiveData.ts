import getCollection, { GAMES_COLLECTION } from "@/db";
import { ArchiveCard, ArchiveData, ArchiveStages, SteamGame } from "@/lib/types";
import { GUIDED_PIPELINE } from "@/lib/pipeline";

// Complete results are required for the animation. Fail explicitly if this small
// educational dataset outgrows the bound rather than animate a truncated sample.
const MAX_STAGE_DOCUMENTS = 2000;

export default async function getArchiveData(): Promise<ArchiveData> {
    const games = await getCollection<SteamGame>(GAMES_COLLECTION);
    const stageNames = ["collection", "match", "unwind", "group", "sort", "limit"] as const;

    // Each facet executes a successive prefix against the same collection input.
    // MongoDB computes membership, genre copies, counts, sorting, and the limit.
    const [stages] = await games.aggregate<ArchiveStages>([
        { $facet: Object.fromEntries(stageNames.map((name, index) => [name, [
            ...GUIDED_PIPELINE.slice(0, index),
            { $limit: MAX_STAGE_DOCUMENTS + 1 },
        ]])) },
    ], { maxTimeMS: 5000 }).toArray();

    for (const name of stageNames) {
        if (stages[name].length > MAX_STAGE_DOCUMENTS) {
            throw new Error(`Guided demo stage ${name} exceeds ${MAX_STAGE_DOCUMENTS} documents; complete stage results are required.`);
        }
    }

    // Alphabetical placement before sort is a presentation choice: $group itself
    // does not promise an order. Keep every group, including those outside top 5.
    const groups = [...stages.group].sort((a, b) => a._id.localeCompare(b._id));
    const genres = groups.map((group) => group._id);
    const counts = groups.map((group) => group.count);
    const matchedIds = new Set(stages.match.map((game) => game._id));
    const copiesById = new Map<number, typeof stages.unwind>();
    for (const output of stages.unwind) {
        const copies = copiesById.get(output._id) ?? [];
        copies.push(output);
        copiesById.set(output._id, copies);
    }

    // Only adapt MongoDB results to drawing coordinates; do not reimplement
    // match predicates or unwind arrays in JavaScript.
    const cards: ArchiveCard[] = [];
    stages.collection.forEach((game, doc) => {
        const pass = matchedIds.has(game._id);
        const copies = copiesById.get(game._id) ?? [];
        if (copies.length === 0) {
            // Keeps the input card visible until match or unwind removes it.
            cards.push({ id: String(game._id), genre: -1, pass, doc, copy: 0, copies: 1 });
            return;
        }
        copies.forEach((output, copy) => {
            const genre = genres.indexOf(output.genres);
            if (genre < 0) throw new Error("Unwind output has no corresponding genre group.");
            cards.push({ id: String(game._id), genre, pass, doc, copy, copies: copies.length });
        });
    });

    return {
        stages, genres, counts, cards,
        total: stages.collection.length,
        matched: stages.match.length,
        unwound: stages.unwind.length,
        groupCount: stages.group.length,
        topGenres: stages.limit,
        source: "mongodb",
    };
}
