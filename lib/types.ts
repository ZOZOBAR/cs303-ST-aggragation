// Stored MongoDB document; Steam AppIDs are numbers, not ObjectIds.
export type SteamGame = {
    _id: number;
    name: string;
    playtimeMinutes: number;
    lastPlayedUnix: number | null;
    genres: string[];
    type: string | null;
    metadataFound: boolean;
};

// Compatibility sample: one game–genre pair AFTER unwind, not an input document.
// The teammate's animation will need full input genre arrays to animate splitting.
export type ArchiveCard = {
    id: string;
    genre: number;
    pass: boolean;
};

export type GenreGroup = {
    _id: string;
    count: number;
    totalMinutes: number;
};

export type ArchiveData = {
    genres: string[];       // up to 10 preview racks, alphabetically ordered
    counts: number[];       // played-entry counts in the same order
    cards: ArchiveCard[];   // sampled game–genre pairs, not collection documents
    total: number;
    matched: number;
    unwound: number;        // all rows after match → unwind, before sampling
    groupCount: number;     // all groups before preview/final limits
    topGenres: GenreGroup[]; // actual final $limit output, ranked by count
    source: "mongodb";
};

// Keep existing action/type names to minimize changes to the client wiring.
export type TopMovie = {
    id: string;
    name: string;
    playtimeMinutes: number;
};

export type MovieDetail = TopMovie & {
    genres: string[];
    lastPlayedUnix: number | null;
};

export type Theme = "day" | "night";
