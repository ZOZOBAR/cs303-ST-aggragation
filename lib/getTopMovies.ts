"use server";

import getCollection, { GAMES_COLLECTION } from "@/db";
import { SteamGame, TopMovie } from "@/lib/types";
import { PLAYED_MATCH, TOP_GAMES } from "@/lib/pipeline";

// Keep the action name for existing client wiring; results are Steam games.
export default async function getTopMovies(genre: string): Promise<TopMovie[]> {
    const games = await getCollection<SteamGame>(GAMES_COLLECTION);
    const docs = await games.aggregate<Pick<SteamGame, "_id" | "name" | "playtimeMinutes">>([
        { $match: { genres: genre, ...PLAYED_MATCH } },
        { $sort: { playtimeMinutes: -1, _id: 1 } },
        { $limit: TOP_GAMES },
        { $project: { name: 1, playtimeMinutes: 1 } },
    ]).toArray();

    return docs.map((doc) => ({
        id: String(doc._id),
        name: doc.name,
        playtimeMinutes: doc.playtimeMinutes,
    }));
}
