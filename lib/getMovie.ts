"use server";

import getCollection, { GAMES_COLLECTION } from "@/db";
import { MovieDetail, SteamGame } from "@/lib/types";

// Every sampled genre copy resolves to the same numeric Steam AppID.
export default async function getMovie(id: string): Promise<MovieDetail | null> {
    if (!/^[1-9]\d*$/.test(id)) return null;
    const appId = Number(id);
    if (!Number.isSafeInteger(appId)) return null;

    const games = await getCollection<SteamGame>(GAMES_COLLECTION);
    const doc = await games.findOne(
        { _id: appId },
        { projection: { name: 1, genres: 1, playtimeMinutes: 1, lastPlayedUnix: 1 } },
    );
    if (!doc) return null;

    return {
        id: String(doc._id),
        name: doc.name,
        genres: doc.genres,
        playtimeMinutes: doc.playtimeMinutes,
        lastPlayedUnix: doc.lastPlayedUnix ?? null,
    };
}
