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

// Scene cards adapt actual stage results into the existing animation geometry.
// Genre copies share "doc" and stay stacked until the unwind stage.
export type ArchiveCard = {
    id: string;      // string AppID only for the scene; game query results keep numeric _id
    genre: number;   // genre colour/rack index; -1 = dropped by match or unwind
    pass: boolean;   // AppID is present in MongoDB's match output
    doc: number;     // which sampled game this copy belongs to
    copy: number;    // position of this genre in the game's genres array
    copies: number;  // unwound copies, or one placeholder for a dropped game
};

export type GenreGroup = {
    _id: string;
    count: number;
    totalMinutes: number;
};

export type UnwoundGame = Omit<SteamGame, "genres"> & { genres: string };

// Executed stages contain actual MongoDB output; stages absent from a preset stay empty.
export type ArchiveStages = {
    collection: SteamGame[];
    match: SteamGame[];
    unwind: UnwoundGame[];
    group: GenreGroup[];
    sort: GenreGroup[];
    limit: GenreGroup[];
};

export type QueryId = "genre-time" | "genre-count" | "long-played" | "terraria-unwind";

export type ArchiveData = {
    queryId: QueryId;
    genres: string[];       // all group racks, alphabetically arranged before sort
    counts: number[];       // played-entry counts in the same order
    cards: ArchiveCard[];   // unwind output copies plus placeholders for dropped games
    stages: ArchiveStages; // complete bounded results, never silently sampled
    total: number;
    matched: number;
    unwound: number;        // rows in the actual unwind output
    groupCount: number;     // all groups before limit
    topGenres: GenreGroup[]; // actual final $limit output in the selected preset's order
    source: "mongodb";
};

// Query projections share the stored field names, numeric AppID, and units.
// Pick selects fields from SteamGame so their types cannot drift independently.
export type GameSummary = Pick<SteamGame, "_id" | "name" | "playtimeMinutes">;

export type GameDetail = Pick<SteamGame,
    "_id" | "name" | "playtimeMinutes" | "genres" | "lastPlayedUnix"
>;

export type Theme = "day" | "night";
