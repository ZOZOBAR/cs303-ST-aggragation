import { ArchiveData } from "@/lib/types";

// Shared settings for the pipeline (used by the server queries and the UI)
export const PLAYED_MATCH = { playtimeMinutes: { $gt: 0 } };
export const LIMIT = 5;
export const TOP_GAMES = 8;

// Shared by the live aggregation and the displayed pipeline.
export const GUIDED_PIPELINE = [
    { $match: PLAYED_MATCH },
    { $unwind: "$genres" },
    { $group: {
        _id: "$genres",
        count: { $sum: 1 },
        totalMinutes: { $sum: "$playtimeMinutes" },
    } },
    { $sort: { count: -1 as const, _id: 1 as const } },
    { $limit: LIMIT },
];

// Each stage of the pipeline shown on the page
export type Stage = {
    op: string;
    title: string;
    sub: string;
    text: string;
    code: number[];   // lines of PIPELINE_CODE that belong to this stage
    meta: (data: ArchiveData) => string;
};

export const PIPELINE_CODE = [
    "db.games.aggregate([",
    ...GUIDED_PIPELINE.map((stage, index) =>
        `  ${JSON.stringify(stage)}${index < GUIDED_PIPELINE.length - 1 ? "," : ""}`
    ),
    "])",
];

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
        sub: "Order by count, descending",
        text: "The racks are re-shelved so the biggest group comes first.",
        code: [1, 2, 3, 4],
        meta: () => "{ count: -1, _id: 1 }",
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

// The query that runs when a rack is clicked
export function drillDownCode(genre: string): string[] {
    return [
        `db.games.aggregate([`,
        `  { $match: { genres: ${JSON.stringify(genre)},`,
        `              playtimeMinutes: { $gt: 0 } } },`,
        `  { $sort: { playtimeMinutes: -1, _id: 1 } },`,
        `  { $limit: ${TOP_GAMES} },`,
        `  { $project: { name: 1, playtimeMinutes: 1 } }`,
        `])`,
    ];
}
