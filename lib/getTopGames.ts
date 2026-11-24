"use server";

import getCollection, { GAMES_COLLECTION } from "@/db";
import { SteamGame, GameSummary } from "@/lib/types";
import { DEFAULT_QUERY_ID, getQueryPreset, TOP_GAMES } from "@/lib/pipeline";

// Return a lightweight projection with the same field names and types as MongoDB.
export default async function getTopGames(genre: string, queryId: string = DEFAULT_QUERY_ID): Promise<GameSummary[]> {
    const preset = getQueryPreset(queryId);
    const games = await getCollection<SteamGame>(GAMES_COLLECTION);
    return games.aggregate<GameSummary>([
        { $match: { ...preset.match, genres: genre } },
        { $sort: { playtimeMinutes: -1, _id: 1 } },
        { $limit: TOP_GAMES },
        { $project: { name: 1, playtimeMinutes: 1 } },
    ]).toArray();
}
