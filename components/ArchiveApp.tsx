"use client";

import { useEffect, useRef, useState } from "react";
import ArchiveScene from "@/components/ArchiveScene";
import InfoPanel from "@/components/InfoPanel";
import { StageCounter, StageScrubber } from "@/components/StageControls";
import { Brand, TopBar } from "@/components/TopBar";
import getTopMovies from "@/lib/getTopMovies";
import { STAGES } from "@/lib/pipeline";
import { ArchiveData, Theme, TopMovie } from "@/lib/types";

const LAST_STAGE = STAGES.length - 1;
const PLAY_DELAY = 2800;

function clampStage(value: number): number {
    return Math.max(0, Math.min(LAST_STAGE, value));
}

// Holds the page state (stage, selected rack, theme) and connects the 3D scene with the UI
export default function ArchiveApp({ data }: { data: ArchiveData }) {
    const [stage, setStage] = useState(0);
    const [selectedGenre, setSelectedGenre] = useState(-1);
    const [theme, setTheme] = useState<Theme>("day");
    const [playing, setPlaying] = useState(false);
    const [topMovies, setTopMovies] = useState<TopMovie[]>([]);
    const [loading, setLoading] = useState(false);

    // Racks can only be selected after $group, so the selection is ignored before that
    const selected = stage >= 3 ? selectedGenre : -1;

    // Rank of the selected rack (alphabetical before $sort, by count after)
    const order = data.genres.map((_, g) => g);
    if (stage >= 4) {
        order.sort((a, b) => data.counts[b] - data.counts[a]);
    } else {
        order.sort((a, b) => data.genres[a].localeCompare(data.genres[b]));
    }
    const rank = order.indexOf(selected);

    function changeStage(next: number) {
        setPlaying(false);
        setStage(clampStage(next));
    }

    // Clicking a rack runs the drill-down Server Action for that genre
    function selectGenre(genre: number) {
        setSelectedGenre(genre);
        setPlaying(false);

        if (genre < 0) {
            return;
        }

        setLoading(true);
        getTopMovies(data.genres[genre])
            .then((movies) => setTopMovies(movies))
            .catch(() => setTopMovies([]))
            .finally(() => setLoading(false));
    }

    function togglePlay() {
        if (playing) {
            setPlaying(false);
            return;
        }
        setSelectedGenre(-1);
        if (stage === LAST_STAGE) {
            setStage(0);
        }
        setPlaying(true);
    }

    // Auto-play: go to the next stage every few seconds, stop at the last one
    const stageRef = useRef(stage);
    useEffect(() => {
        stageRef.current = stage;
    }, [stage]);

    useEffect(() => {
        if (!playing) {
            return;
        }
        const timer = setInterval(() => {
            if (stageRef.current >= LAST_STAGE) {
                setPlaying(false);
            } else {
                setStage((prev) => clampStage(prev + 1));
            }
        }, PLAY_DELAY);
        return () => clearInterval(timer);
    }, [playing]);

    // Keyboard: ← → to change stage, Esc to close the drill-down
    useEffect(() => {
        function handleKey(event: KeyboardEvent) {
            if (event.key === "ArrowRight") {
                setPlaying(false);
                setStage((prev) => clampStage(prev + 1));
            }
            if (event.key === "ArrowLeft") {
                setPlaying(false);
                setStage((prev) => clampStage(prev - 1));
            }
            if (event.key === "Escape") {
                setSelectedGenre(-1);
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    const source = data.source === "mongodb" ? "sample_mflix.movies · live" : "demo data";

    return (
        <main className={theme === "night" ? "app night" : "app"}>
            <ArchiveScene data={data} stage={stage} selected={selected} theme={theme} onSelect={selectGenre} />
            <div className="veil" />

            <Brand />
            <TopBar source={source} theme={theme} playing={playing} onTheme={setTheme} onPlay={togglePlay} />

            <InfoPanel
                data={data}
                stage={stage}
                selected={selected}
                rank={rank}
                topMovies={topMovies}
                loading={loading}
                onNext={() => changeStage(stage === LAST_STAGE ? 0 : stage + 1)}
                onBack={() => setSelectedGenre(-1)}
            />

            <StageCounter stage={stage} />
            <StageScrubber stage={stage} onChange={changeStage} />

            <footer className="footer">
                <div className="micro">{data.cards.length} cards · random $sample of the collection</div>
                <div className="micro">← → step / drag orbit / click a rack</div>
                <div className="micro">{data.source === "mongodb" ? "MongoDB Atlas" : "No MONGO_URI · demo data"}</div>
            </footer>
        </main>
    );
}
