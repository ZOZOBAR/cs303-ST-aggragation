import { ArchiveData, MovieDetail, TopMovie } from "@/lib/types";
import { CARD_COUNT, TOP_MOVIES, YEAR_FROM } from "@/lib/pipeline";

// Demo data so the page still works without a database (e.g. before MONGO_URI is set).
// The numbers are made up; the real numbers come from getArchiveData().

const GENRES = ["Drama", "Comedy", "Romance", "Crime", "Thriller", "Action", "Adventure", "Documentary", "Horror", "Biography"];
const WEIGHTS = [22, 15, 9, 8, 9, 11, 7, 6, 6, 5];

// Small seeded random generator, so the demo looks the same every time
function makeRandom(seed: number) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return value / 2147483647;
    };
}

function pickGenre(random: () => number): number {
    const sum = WEIGHTS.reduce((a, b) => a + b, 0);
    let r = random() * sum;
    for (let i = 0; i < WEIGHTS.length; i++) {
        r -= WEIGHTS[i];
        if (r <= 0) {
            return i;
        }
    }
    return 0;
}

export function makeDemoArchive(): ArchiveData {
    const random = makeRandom(11);

    const cards = Array.from({ length: CARD_COUNT }, (_, i) => ({
        id: `demo-${i}`,
        genre: pickGenre(random),
        pass: 1976 + Math.floor(random() * 48) >= YEAR_FROM,
    }));

    const counts = GENRES.map((_, g) =>
        cards.filter((card) => card.genre === g && card.pass).length * 23
    );

    return {
        genres: GENRES,
        counts,
        cards,
        total: CARD_COUNT * 23,
        matched: cards.filter((card) => card.pass).length * 23,
        source: "demo",
    };
}

export function makeDemoTopMovies(genre: string): TopMovie[] {
    const random = makeRandom(genre.length * 97);

    return Array.from({ length: TOP_MOVIES }, (_, i) => ({
        id: `${genre}-${i}`,
        title: `${genre} demo title ${String(i + 1).padStart(2, "0")}`,
        year: YEAR_FROM + Math.floor(random() * 16),
        rating: Math.round((9 - i * 0.2 - random() * 0.1) * 10) / 10,
    }));
}

// Fake details for one card in demo mode (id looks like "demo-123")
export function makeDemoMovie(id: string, genre: string): MovieDetail {
    const index = Number(id.replace("demo-", "")) || 0;
    const random = makeRandom(index + 7);

    return {
        id,
        title: `Demo movie ${String(index).padStart(3, "0")}`,
        year: YEAR_FROM + Math.floor(random() * 16),
        genres: [genre],
        rating: Math.round((5 + random() * 4) * 10) / 10,
        votes: Math.floor(10000 + random() * 200000),
        runtime: 85 + Math.floor(random() * 60),
        directors: ["Demo Director"],
        cast: ["Actor A", "Actor B", "Actor C"],
        plot: "Demo data. Connect MONGO_URI to see the real document from sample_mflix.",
    };
}
