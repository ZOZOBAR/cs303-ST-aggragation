"use client";

import { useEffect, useRef, useState } from "react";
import ArchiveScene from "@/components/ArchiveScene";
import InfoPanel from "@/components/InfoPanel";
import { StageCounter, StageScrubber } from "@/components/StageControls";
import { Brand, TopBar } from "@/components/TopBar";
import getTopGames from "@/lib/getTopGames";
import runQuery from "@/lib/runQuery";
import { getStages } from "@/lib/pipeline";
import { ArchiveData, Theme, GameSummary } from "@/lib/types";

const PLAY_DELAY = 2800;

function clampStage(value: number, lastStage: number): number {
    return Math.max(0, Math.min(lastStage, value));
}

// Holds the page state (stage, selected rack, theme) and connects the 3D scene with the UI
export default function ArchiveApp({ data: initialData }: { data: ArchiveData }) {
    const [data, setData] = useState(initialData);
    const [draftQueryId, setDraftQueryId] = useState<string>(initialData.queryId);
    const [queryPending, setQueryPending] = useState(false);
    const [queryError, setQueryError] = useState("");
    const stages = getStages(data.queryId);
    const lastStage = stages.length - 1;
    const drillRequest = useRef(0);
    const [stage, setStage] = useState(0);
    const [selectedGenre, setSelectedGenre] = useState(-1);
    const [theme, setTheme] = useState<Theme>("day");
    const [playing, setPlaying] = useState(false);
    const [topGames, setTopGames] = useState<GameSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedCardIndex, setSelectedCardIndex] = useState(-1);

    // Racks can only be selected after $group, so the selection is ignored before that
    const selected = stage >= 3 ? selectedGenre : -1;

    // A single card can be opened on the floor (raw / $match / $unwind),
    // or after $group only inside the open rack
    const cardInfo = data.cards[selectedCardIndex];
    const selectedCard = cardInfo && (stage < 3 || (selected >= 0 && cardInfo.genre === selected)) ? selectedCardIndex : -1;

    // Preserve MongoDB's actual sort order, including its tie-breaking rule.
    const order = stage >= 4
        ? data.stages.sort.map((group) => data.genres.indexOf(group._id))
        : data.genres.map((_, g) => g);
    const rank = order.indexOf(selected);

    function changeStage(next: number) {
        if (queryPending) return;
        setPlaying(false);
        setStage(clampStage(next, lastStage));
    }

    // Clicking a rack runs the drill-down Server Action for that genre
    function selectGenre(genre: number) {
        if (queryPending) return;
        const request = ++drillRequest.current;
        setSelectedGenre(genre);
        setSelectedCardIndex(-1);
        setPlaying(false);

        if (genre < 0) {
            return;
        }

        setLoading(true);
        getTopGames(data.genres[genre], data.queryId)
            .then((games) => { if (request === drillRequest.current) setTopGames(games); })
            .catch(() => { if (request === drillRequest.current) setTopGames([]); })
            .finally(() => { if (request === drillRequest.current) setLoading(false); });
    }

    // The panel reads the selected card's actual document from data.stages.
    function selectCard(index: number) {
        if (queryPending) return;
        setSelectedCardIndex(index);
    }

    async function executeQuery() {
        if (queryPending) return;
        setQueryPending(true);
        setQueryError("");
        setPlaying(false);
        ++drillRequest.current;
        setLoading(false);
        try {
            const result = await runQuery(draftQueryId);
            if (result.error !== undefined) {
                setQueryError(result.error);
                return;
            }
            setData(result.data);
            setStage(0);
            setSelectedGenre(-1);
            setSelectedCardIndex(-1);
            setTopGames([]);
        } catch {
            setQueryError("Could not run this example. Previous results are still displayed. Please try again.");
        } finally {
            setQueryPending(false);
        }
    }

    function togglePlay() {
        if (queryPending) return;
        if (playing) {
            setPlaying(false);
            return;
        }
        setSelectedGenre(-1);
        if (stage === lastStage) {
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
            if (stageRef.current >= lastStage) {
                setPlaying(false);
            } else {
                setStage((prev) => clampStage(prev + 1, lastStage));
            }
        }, PLAY_DELAY);
        return () => clearInterval(timer);
    }, [playing, lastStage]);

    const cardOpenRef = useRef(false);
    useEffect(() => {
        cardOpenRef.current = selectedCard >= 0;
    }, [selectedCard]);

    // Keyboard: ← → to change stage, Esc to close the open card / rack
    useEffect(() => {
        function handleKey(event: KeyboardEvent) {
            const target = event.target;
            if (queryPending || (target instanceof HTMLElement && target.closest("select, input, textarea, [contenteditable='true']"))) return;
            if (event.key === "ArrowRight") {
                setPlaying(false);
                setStage((prev) => clampStage(prev + 1, lastStage));
            }
            if (event.key === "ArrowLeft") {
                setPlaying(false);
                setStage((prev) => clampStage(prev - 1, lastStage));
            }
            if (event.key === "Escape") {
                // Close the open card first, then the open rack
                if (cardOpenRef.current) {
                    setSelectedCardIndex(-1);
                } else {
                    setSelectedGenre(-1);
                }
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [lastStage, queryPending]);

    const source = "steam-analytics.games · live";

    return (
        <main className={theme === "night" ? "app night" : "app"}>
            <ArchiveScene
                key={`scene-${data.queryId}`}
                data={data}
                stage={stage}
                selected={selected}
                selectedCard={selectedCard}
                theme={theme}
                onSelect={selectGenre}
                onSelectCard={selectCard}
            />
            <div className="veil" />

            <Brand />
            <TopBar source={source} theme={theme} playing={playing} onTheme={setTheme} onPlay={togglePlay}
                queryId={draftQueryId} onQueryChange={setDraftQueryId} onRunQuery={executeQuery}
                queryPending={queryPending} queryError={queryError} queryDirty={draftQueryId !== data.queryId} />

            <InfoPanel
                key={`panel-${data.queryId}`}
                data={data}
                stage={stage}
                selected={selected}
                rank={rank}
                topGames={topGames}
                loading={loading}
                selectedCard={selectedCard}
                onNext={() => changeStage(stage === lastStage ? 0 : stage + 1)}
                onBack={() => setSelectedGenre(-1)}
                onCloseCard={() => setSelectedCardIndex(-1)}
            />

            <StageCounter stage={stage} total={stages.length} />
            <StageScrubber stage={stage} stages={stages} onChange={changeStage} disabled={queryPending} />

            <footer className="footer">
                <div className="micro">{data.total} games · MongoDB stage results</div>
                <div className="micro">← → step / drag orbit / click a rack, then a card</div>
                <div className="micro">MongoDB Atlas</div>
            </footer>
        </main>
    );
}
