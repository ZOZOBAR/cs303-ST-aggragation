import { ArchiveData, QueryId } from "@/lib/types";

// Shared settings for the pipeline (used by the server queries and the UI)
export const PLAYED_MATCH = { playtimeMinutes: { $gt: 0 } };
export const LIMIT = 5;
export const TOP_GAMES = 8;

export const DEFAULT_QUERY_ID: QueryId = "genre-time";
export const STAGE_NAMES = ["collection", "match", "unwind", "group", "sort", "limit"] as const;

export type QueryPreset = {
    id: QueryId;
    label: string;
    match: Record<string, unknown>;
    matchLabel: string;
    rankField: "count" | "totalMinutes" | null;
    pipeline: Record<string, unknown>[];
};

const LONG_PLAYED_MATCH = { playtimeMinutes: { $gte: 600 } };
const TERRARIA_MATCH = { name: "Terraria" };

const groupStage = { $group: {
    _id: "$genres",
    count: { $sum: 1 },
    totalMinutes: { $sum: "$playtimeMinutes" },
} };

function genrePipeline(match: Record<string, unknown>, rankField: "count" | "totalMinutes") {
    return [
        { $match: match },
        { $unwind: "$genres" },
        groupStage,
        { $sort: { [rankField]: -1, _id: 1 } },
        { $limit: LIMIT },
    ];
}

// Only these fixed, read-only examples can be executed from the browser.
export const QUERY_PRESETS: QueryPreset[] = [
    { id: "genre-time", label: "Genres by total playtime", match: PLAYED_MATCH,
        matchLabel: "playtimeMinutes > 0", rankField: "totalMinutes",
        pipeline: genrePipeline(PLAYED_MATCH, "totalMinutes") },
    { id: "genre-count", label: "Genres by game count", match: PLAYED_MATCH,
        matchLabel: "playtimeMinutes > 0", rankField: "count",
        pipeline: genrePipeline(PLAYED_MATCH, "count") },
    { id: "long-played", label: "Games played at least 10 hours", match: LONG_PLAYED_MATCH,
        matchLabel: "playtimeMinutes >= 600 (10 hours)", rankField: "totalMinutes",
        pipeline: genrePipeline(LONG_PLAYED_MATCH, "totalMinutes") },
    { id: "terraria-unwind", label: "Terraria: match and unwind", match: TERRARIA_MATCH,
        matchLabel: 'name = "Terraria"', rankField: null,
        pipeline: [{ $match: TERRARIA_MATCH }, { $unwind: "$genres" }] },
];

export function getQueryPreset(id: string): QueryPreset {
    const preset = QUERY_PRESETS.find((query) => query.id === id);
    if (!preset) throw new Error("Unknown query preset");
    return preset;
}

export const GUIDED_PIPELINE = getQueryPreset(DEFAULT_QUERY_ID).pipeline;

// Each stage of the pipeline shown on the page
export type Stage = {
    op: string;
    title: string;
    sub: string;
    text: string;
    code: number[];   // lines of PIPELINE_CODE that belong to this stage
    meta: (data: ArchiveData) => string;
};

export function getPipelineCode(queryId: string): string[] {
    const { pipeline } = getQueryPreset(queryId);
    return [
        "db.games.aggregate([",
        ...pipeline.map((stage, index) =>
            `  ${JSON.stringify(stage)}${index < pipeline.length - 1 ? "," : ""}`
        ),
        "])",
    ];
}

export const PIPELINE_CODE = getPipelineCode(DEFAULT_QUERY_ID);

const format = (n: number) => n.toLocaleString("en-US");

export const STAGES: Stage[] = [
    {
        op: "collection",
        title: "db.games",
        sub: "The raw collection",
        text: "The collection has one document per Steam app. Each card on the floor represents one document from the actual collection-stage output.",
        code: [0],
        meta: (data) => `${format(data.total)} documents · unordered`,
    },
    {
        op: "$match",
        title: "$match",
        sub: "Filter: playtimeMinutes > 0",
        text: "Cards that fail the condition sink into the floor. Putting $match first means every later stage has less to process.",
        code: [1],
        meta: (data) => `${format(data.total)} → ${format(data.matched)} documents`,
    },
    {
        op: "$unwind",
        title: "$unwind",
        sub: "Split the genres array",
        text: "A game can have several Store genres. $unwind splits each card into one copy per genre, keeping AppID and playtime. Games with an empty genres array are dropped.",
        code: [1, 2],
        meta: (data) => `${format(data.matched)} → ${format(data.unwound)} documents`,
    },
    {
        op: "$group",
        title: "$group",
        sub: "Group by genre, count",
        text: "Each genre becomes one aggregate document with count and totalMinutes. Rack length represents played-entry count. Every output group has a rack; shared genres mean time totals overlap.",
        code: [1, 2, 3],
        meta: (data) => `${format(data.unwound)} documents → ${data.groupCount} groups`,
    },
    {
        op: "$sort",
        title: "$sort",
        sub: "Order by total playtime, descending",
        text: "The genre with the most total playtime comes first. Rack length still represents entry count; labels show total minutes separately.",
        code: [1, 2, 3, 4],
        meta: () => JSON.stringify(GUIDED_PIPELINE[3].$sort),
    },
    {
        op: "$limit",
        title: "$limit",
        sub: `Keep the top ${LIMIT}`,
        text: "Everything below the cut is set aside. Click a rack to pull it out and run a new query on that group.",
        code: [1, 2, 3, 4, 5],
        meta: (data) => `${data.groupCount} groups → ${data.topGenres.length} final groups`,
    },
];

// Presets use either the full genre pipeline or its match/unwind introduction.
export function getStages(queryId: string): Stage[] {
    const preset = getQueryPreset(queryId);
    return STAGES.slice(0, preset.pipeline.length + 1).map((stage, index) => {
        if (index === 1) return { ...stage, sub: `Filter: ${preset.matchLabel}` };
        if (index === 4) return {
            ...stage,
            sub: preset.rankField === "count" ? "Order by entry count, descending" : "Order by total playtime, descending",
            text: preset.rankField === "count"
                ? "Genres with more qualifying library entries come first. Rack length represents entry count."
                : "Genres with more total playtime come first. Rack length remains entry count; labels show minutes separately.",
            meta: () => JSON.stringify(preset.pipeline[3].$sort),
        };
        return stage;
    });
}
