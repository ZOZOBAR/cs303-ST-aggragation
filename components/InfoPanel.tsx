import CodeBlock from "@/components/CodeBlock";
import { ArchiveData, TopMovie } from "@/lib/types";
import { PIPELINE_CODE, STAGES, drillDownCode } from "@/lib/pipeline";

type InfoPanelProps = {
    data: ArchiveData;
    stage: number;
    selected: number;
    rank: number;
    topMovies: TopMovie[];
    loading: boolean;
    onNext: () => void;
    onBack: () => void;
};

// Right column: explains the current stage, or shows the result of the drill-down query
export default function InfoPanel({ data, stage, selected, rank, topMovies, loading, onNext, onBack }: InfoPanelProps) {
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
                    <p className="info-meta">rank #{rank + 1} · top rated · sorted by imdb.rating</p>

                    <CodeBlock lines={drillDownCode(genre)} past={[0, 1, 2, 3, 4, 5, 6]} />

                    <ul className="movie-list">
                        {loading && <li className="loading">Running query…</li>}
                        {!loading && topMovies.map((movie, i) => (
                            <li key={movie.id} style={{ animationDelay: `${i * 45}ms` }}>
                                <span className="index">{String(i + 1).padStart(2, "0")}</span>
                                <span>{movie.title} <span className="year">· {movie.year}</span></span>
                                <span className="rating">★ {movie.rating}</span>
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
                    <span>db.movies</span>
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
