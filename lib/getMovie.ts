"use server";

import { ObjectId } from "mongodb";
import getCollection, { hasDatabase, MOVIES_COLLECTION } from "@/db";
import { MovieDetail } from "@/lib/types";
import { makeDemoMovie } from "@/lib/demoData";

// Server Action: called when a single card is clicked.
// Not a pipeline this time — one document is looked up directly by its _id with findOne().
export default async function getMovie(id: string, genre: string): Promise<MovieDetail | null> {
    if (!hasDatabase() || !ObjectId.isValid(id)) {
        return makeDemoMovie(id, genre);
    }

    const movies = await getCollection(MOVIES_COLLECTION);

    const doc = await movies.findOne(
        { _id: new ObjectId(id) },
        { projection: { title: 1, year: 1, genres: 1, imdb: 1, runtime: 1, directors: 1, cast: 1, plot: 1 } }
    );

    if (!doc) {
        return null;
    }

    // Only send plain values to the client
    return {
        id,
        title: doc.title ?? "Untitled",
        year: doc.year,
        genres: doc.genres ?? [],
        rating: doc.imdb?.rating ?? null,
        votes: doc.imdb?.votes ?? null,
        runtime: doc.runtime ?? null,
        directors: doc.directors ?? [],
        cast: (doc.cast ?? []).slice(0, 4),
        plot: doc.plot ?? "",
    };
}
