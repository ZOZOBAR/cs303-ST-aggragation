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

// One card in the scene = one (game, genre) copy, as produced by $unwind.
// Copies of the same game share "doc" and stand on the same spot until $unwind splits them.
export type ArchiveCard = {
    id: string;      // the game's AppID
    genre: number;   // preview rack index; -2 = genre outside the preview racks; -1 = no genres
    pass: boolean;   // passes $match (playtimeMinutes > 0)
    doc: number;     // which sampled game this copy belongs to
    copy: number;    // position of this genre in the game's genres array
    copies: number;  // how many genres the game has
};

export type GenreGroup = {
    _id: string;
    count: number;
    totalMinutes: number;
};

export type ArchiveData = {
    genres: string[];       // up to 10 preview racks, alphabetically ordered
    counts: number[];       // played-entry counts in the same order
    cards: ArchiveCard[];   // one card per (sampled game, genre) copy
    sampled: number;        // games in the $sample
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
