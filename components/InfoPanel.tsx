import CodeBlock from "@/components/CodeBlock";
import { ArchiveData, GameDetail, GameSummary } from "@/lib/types";
import { PIPELINE_CODE, STAGES, drillDownCode } from "@/lib/pipeline";

type InfoPanelProps = {
    data: ArchiveData;
    stage: number;
    selected: number;
    rank: number;
    topGames: GameSummary[];
    loading: boolean;
    selectedCard: number;
    game: GameDetail | null;
    gameLoading: boolean;
    onNext: () => void;
    onBack: () => void;
    onCloseCard: () => void;
};

// Right column: explains the current stage, or shows the result of the drill-down query
export default function InfoPanel(props: InfoPanelProps) {
    const { data, stage, selected, rank, topGames, loading, selectedCard, game, gameLoading, onNext, onBack, onCloseCard } = props;

    // Document view: a single card was clicked
    if (selectedCard >= 0) {
        const cardGenre = data.cards[selectedCard].genre;
        const genre = selected >= 0 ? data.genres[selected] : cardGenre >= 0 ? data.genres[cardGenre] : "collection";
        const backLabel = selected >= 0 ? `Back to ${genre}` : "Back to pipeline";
        const id = data.cards[selectedCard].id;

        return (
            <section className="info-panel">
                <div className="fade-in" key={`card-${selectedCard}`}>
                    <div className="micro">Pipeline / <b>{genre}</b> / document</div>
                    <div className="info-row">
                        <span>DOCUMENT</span>
                        <span>_id</span>
                    </div>

                    {gameLoading && <p className="info-meta">Running findOne…</p>}
                    {!gameLoading && !game && <p className="info-meta">Document not found.</p>}
                    {!gameLoading && game && (
                        <>
                            <h2 className="info-title movie-title">{game.name}</h2>
                            <p className="info-sub">
                                {game.playtimeMinutes.toLocaleString("en-US")} min played
                            </p>

                            <dl className="detail-list">
                                <dt>genres</dt>
                                <dd>{game.genres.join(", ") || "None recorded"}</dd>
                                <dt>last played (UTC)</dt>
                                <dd>{game.lastPlayedUnix === null ? "Unavailable" : new Date(game.lastPlayedUnix * 1000).toISOString().slice(0, 10)}</dd>
                            </dl>
                        </>
                    )}

                    <CodeBlock lines={[`db.games.findOne({`, `  _id: ${id}`, `})`]} past={[0, 1, 2]} />

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

                    <CodeBlock lines={drillDownCode(genre)} past={[0, 1, 2, 3, 4, 5, 6]} />

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
