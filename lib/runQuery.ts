"use server";

import getArchiveData from "@/lib/getArchiveData";
import { getQueryPreset } from "@/lib/pipeline";
import { ArchiveData } from "@/lib/types";

export default async function runQuery(queryId: string): Promise<
    { data: ArchiveData; error?: never } | { data?: never; error: string }
> {
    // Validate the ID before opening a database connection. Never accept a pipeline.
    try {
        getQueryPreset(queryId);
    } catch {
        return { error: "Unknown query preset." };
    }
    try {
        return { data: await getArchiveData(queryId) };
    } catch (error) {
        console.error("Query preset failed:", queryId, error instanceof Error ? error.name : "Unknown error");
        return { error: "Could not run this example. Your previous results are still displayed. Please try again." };
    }
}
