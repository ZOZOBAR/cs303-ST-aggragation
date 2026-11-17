import { ArchiveData } from "@/lib/types";

// Shared settings for the pipeline (used by the server queries and the UI)
export const YEAR_FROM = 2000;
export const GENRE_COUNT = 10;
export const LIMIT = 5;
export const CARD_COUNT = 900;
export const TOP_MOVIES = 8;
export const MIN_VOTES = 10000;

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
    `db.movies.aggregate([`,
    `  { $match:  { year: { $gte: ${YEAR_FROM} } } },`,
    `  { $unwind: "$genres" },`,
    `  { $group:  { _id: "$genres", count: { $sum: 1 } } },`,
    `  { $sort:   { count: -1 } },`,
    `  { $limit:  ${LIMIT} }`,
    `])`,
];

const format = (n: number) => n.toLocaleString("en-US");

export const STAGES: Stage[] = [
    {
        op: "collection",
        title: "db.movies",
        sub: "The raw collection",
        text: "Every card on the floor is a movie document. Nothing is filtered, grouped or sorted yet.",
        code: [0],
        meta: (data) => `${format(data.total)} documents · unordered`,
    },
    {
        op: "$match",
        title: "$match",
        sub: `Filter: year ≥ ${YEAR_FROM}`,
        text: "Cards that fail the condition sink into the floor. Putting $match first means every later stage has less to process.",
        code: [1],
        meta: (data) => `${format(data.total)} → ${format(data.matched)} documents`,
    },
    {
        op: "$unwind",
        title: "$unwind",
        sub: "Split the genres array",
        text: "A movie can have several genres. $unwind makes one copy per genre, so each card now carries one colour = one genre.",
        code: [1, 2],
        meta: () => "1 document → 1 card per genre",
    },
    {
        op: "$group",
        title: "$group",
        sub: "Group by genre, count",
        text: "Cards with the same _id are filed into the same rack. Rack length = count, so the data itself becomes a bar chart.",
        code: [1, 2, 3],
        meta: (data) => `${format(data.matched)} documents → ${data.genres.length} genre racks`,
    },
    {
        op: "$sort",
        title: "$sort",
        sub: "Order by count, descending",
        text: "The racks are re-shelved so the biggest group comes first.",
        code: [1, 2, 3, 4],
        meta: () => "{ count: -1 }",
    },
    {
        op: "$limit",
        title: "$limit",
        sub: `Keep the top ${LIMIT}`,
        text: "Everything below the cut is set aside. Click a rack to pull it out and run a new query on that group.",
        code: [1, 2, 3, 4, 5],
        meta: (data) => `${data.genres.length} groups → ${LIMIT} groups`,
    },
];

// The query that runs when a rack is clicked
export function drillDownCode(genre: string): string[] {
    return [
        `db.movies.aggregate([`,
        `  { $match: { genres: "${genre}",`,
        `              year: { $gte: ${YEAR_FROM} },`,
        `              "imdb.votes": { $gte: ${MIN_VOTES} } } },`,
        `  { $sort:  { "imdb.rating": -1 } },`,
        `  { $limit: ${TOP_MOVIES} }`,
        `])`,
    ];
}
