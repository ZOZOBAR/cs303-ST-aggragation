"use server";

import getCollection, { hasDatabase, MOVIES_COLLECTION } from "@/db";
import { TopMovie } from "@/lib/types";
import { MIN_VOTES, TOP_MOVIES, YEAR_FROM } from "@/lib/pipeline";
import { makeDemoTopMovies } from "@/lib/demoData";

// Server Action: called from the client when a rack is clicked.
// Runs a second pipeline ($match → $sort → $limit) for that one genre.
export default async function getTopMovies(genre: string): Promise<TopMovie[]> {
    if (!hasDatabase()) {
        return makeDemoTopMovies(genre);
    }

    const movies = await getCollection(MOVIES_COLLECTION);

    const docs = await movies.aggregate<{ _id: unknown; title: string; year: number; rating: number }>([
        {
            $match: {
                genres: genre,
                year: { $gte: YEAR_FROM },
                "imdb.votes": { $gte: MIN_VOTES },
            },
        },
        { $sort: { "imdb.rating": -1 } },
        { $limit: TOP_MOVIES },
        { $project: { title: 1, year: 1, rating: "$imdb.rating" } },
    ]).toArray();

    // Only send plain values to the client (the ObjectId becomes a string)
    return docs.map((doc) => ({
        id: String(doc._id),
        title: doc.title,
        year: doc.year,
        rating: doc.rating,
    }));
}
