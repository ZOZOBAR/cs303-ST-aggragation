// One card in the 3D archive = one document after $unwind (one movie + one genre)
export type ArchiveCard = {
    genre: number;   // index into ArchiveData.genres
    pass: boolean;   // true if the movie passes the $match stage
};

// Everything the page needs to draw the archive
export type ArchiveData = {
    genres: string[];       // the groups shown as racks
    counts: number[];       // real $group counts, same order as genres
    cards: ArchiveCard[];   // a random $sample of documents to draw
    total: number;          // documents in the collection
    matched: number;        // documents left after $match
    source: "mongodb" | "demo";
};

// A row in the drill-down list
export type TopMovie = {
    id: string;
    title: string;
    year: number;
    rating: number;
};

export type Theme = "day" | "night";
