import CodeBlock from "@/components/CodeBlock";
import { ArchiveData, GameSummary } from "@/lib/types";
import { PIPELINE_CODE, STAGES } from "@/lib/pipeline";

type InfoPanelProps = {
    data: ArchiveData;
    stage: number;
    selected: number;
    rank: number;
    topGames: GameSummary[];
    loading: boolean;
    selectedCard: number;
    onNext: () => void;
    onBack: () => void;
    onCloseCard: () => void;
};

// Right column: explains the current stage, or shows the result of the drill-down query
export default function InfoPanel(props: InfoPanelProps) {
    const { data, stage, selected, rank, topGames, loading, selectedCard, onNext, onBack, onCloseCard } = props;

    const groupOutputs = stage === 3 ? data.stages.group
        : stage === 4 ? data.stages.sort : stage === 5 ? data.stages.limit : [];
    const groupIndex = selected >= 0 ? selected : data.cards[selectedCard]?.genre ?? -1;
    const groupDocument = groupOutputs.find((doc) => doc._id === data.genres[groupIndex]);

    // Document view: a single card was clicked
    if (selectedCard >= 0) {
        const cardGenre = data.cards[selectedCard].genre;
        const genre = selected >= 0 ? data.genres[selected] : cardGenre >= 0 ? data.genres[cardGenre] : "collection";
        const backLabel = selected >= 0 ? `Back to ${genre}` : "Back to pipeline";
        const id = Number(data.cards[selectedCard].id);
        const documents = stage === 0 ? data.stages.collection
            : stage === 1 ? data.stages.match : data.stages.unwind;
        // AppID alone is insufficient after unwind: each genre has its own copy.
        const game = documents.find((doc) => doc._id === id &&
            (stage < 2 || doc.genres === data.genres[cardGenre]));
        const document = stage >= 3 ? groupDocument : game;
        const documentLines = document ? JSON.stringify(document, null, 2).split("\n") : [];

        return (
            <section className="info-panel">
                <div className="fade-in" key={`card-${selectedCard}`}>
                    <div className="micro">Pipeline / <b>{genre}</b> / document</div>
                    <div className="info-row">
                        <span>DOCUMENT</span>
                        <span>_id</span>
                    </div>

                    {!document && <p className="info-meta">Document is not present in this stage.</p>}
                    {game && (
                        <>
                            <h2 className="info-title movie-title">{game.name}</h2>
                            <p className="info-sub">
                                {game.playtimeMinutes.toLocaleString("en-US")} min played
                            </p>

                            <dl className="detail-list">
                                <dt>genres</dt>
                                <dd>{Array.isArray(game.genres) ? game.genres.join(", ") || "None recorded" : game.genres}</dd>
                                <dt>last played (UTC)</dt>
                                <dd>{game.lastPlayedUnix === null ? "Unavailable" : new Date(game.lastPlayedUnix * 1000).toISOString().slice(0, 10)}</dd>
                            </dl>
                        </>
                    )}

                    {document && (
                        <>
                            <p className="info-meta">{STAGES[stage].op} output document</p>
                            <CodeBlock lines={documentLines} past={documentLines.map((_, i) => i)} />
                        </>
                    )}

                    <button className="panel-action" onClick={onCloseCard}>
                        <span>{backLabel}</span>
                        <span className="arrow">↙</span>
                    </button>
                </div>
            </section>
        );
    }

    // Drill-down view: a rack was clicked
    if (selected >= 0) {
        const genre = data.genres[selected];
        const documentLines = groupDocument ? JSON.stringify(groupDocument, null, 2).split("\n") : [];

        return (
            <section className="info-panel">
                <div className="fade-in" key={`group-${selected}`}>
                    <div className="micro">Pipeline / <b>$group</b> / drill-down</div>
                    <div className="info-row">
                        <span>GROUP {String(rank + 1).padStart(3, "0")}</span>
                        <span>_id</span>
                    </div>
                    <h2 className="info-title">{genre}</h2>
                    <p className="info-sub">{data.counts[selected].toLocaleString("en-US")} documents</p>
                    <p className="info-meta">rank #{rank + 1} by entry count · games by playtime · click a card to open it</p>

                    {groupDocument ? (
                        <CodeBlock lines={documentLines} past={documentLines.map((_, i) => i)} />
                    ) : (
                        <p className="info-meta">Document is not present in this stage.</p>
                    )}

                    <ul className="movie-list">
                        {loading && <li className="loading">Running query…</li>}
                        {!loading && topGames.map((game, i) => (
                            <li key={game._id} style={{ animationDelay: `${i * 45}ms` }}>
                                <span className="index">{String(i + 1).padStart(2, "0")}</span>
                                <span>{game.name}</span>
                                <span className="rating">{game.playtimeMinutes.toLocaleString("en-US")} min</span>
                            </li>
                        ))}
                    </ul>

                    <button className="panel-action" onClick={onBack}>
                        <span>Back to pipeline</span>
                        <span className="arrow">↙</span>
                    </button>
                </div>
            </section>
        );
    }

    // Stage view
    const info = STAGES[stage];
    const currentLine = info.code[info.code.length - 1];
    const pastLines = [0, PIPELINE_CODE.length - 1, ...info.code];
    const isLast = stage === STAGES.length - 1;

    return (
        <section className="info-panel">
            <div className="fade-in" key={`stage-${stage}`}>
                <div className="micro">Pipeline / <b>{info.op}</b></div>
                <div className="info-row">
                    <span>STAGE {String(stage + 1).padStart(3, "0")}</span>
                    <span>db.games</span>
                </div>
                <h2 className="info-title">
                    {info.title.startsWith("$") ? <><span>$</span>{info.title.slice(1)}</> : info.title}
                </h2>
                <p className="info-sub">{info.sub}</p>
                <p className="info-meta">{info.meta(data)}</p>
                <p className="info-text">{info.text}</p>

                <CodeBlock lines={PIPELINE_CODE} current={currentLine} past={pastLines} />

                <button className="panel-action" onClick={onNext}>
                    <span>{isLast ? "Replay pipeline" : `Next stage · ${STAGES[stage + 1].op}`}</span>
                    <span className="arrow">↗</span>
                </button>
            </div>
        </section>
    );
}
