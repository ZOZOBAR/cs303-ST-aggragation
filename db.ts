import { MongoClient, Db, Collection } from "mongodb";

const MONGO_URI = process.env.MONGO_URI;

// MongoDB's free sample dataset (Atlas → Load Sample Dataset)
const DB_NAME = "sample_mflix";
export const MOVIES_COLLECTION = "movies";

let client: MongoClient | null = null;
let db: Db | null = null;

// Lets the app fall back to demo data when no database is configured
export function hasDatabase(): boolean {
    return Boolean(MONGO_URI);
}

async function connect(): Promise<Db> {
    if (!MONGO_URI) {
        throw new Error("MONGO_URI environment variable is undefined");
    }

    if (!client) {
        client = new MongoClient(MONGO_URI);
        await client.connect();
    }

    return client.db(DB_NAME);
}

export default async function getCollection(
    collectionName: string,
): Promise<Collection> {
    if (!db) {
        db = await connect();
    }

    return db.collection(collectionName);
}
