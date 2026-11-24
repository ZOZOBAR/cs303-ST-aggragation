import { QUERY_PRESETS } from "@/lib/pipeline";
import { Theme } from "@/lib/types";

type TopBarProps = {
    source: string;
    theme: Theme;
    playing: boolean;
    onTheme: (theme: Theme) => void;
    onPlay: () => void;
    queryId: string;
    onQueryChange: (id: string) => void;
    onRunQuery: () => void;
    queryPending: boolean;
    queryDirty: boolean;
    queryError: string;
};

// Top-left title
export function Brand() {
    return (
        <header className="brand">
            <h1 className="brand-title">AGGRE<span>/</span>GATE</h1>
            <div className="micro">Data Archive / Pipeline Terminal</div>
        </header>
    );
}

// Top-right: data source, day/night switch, play button
export function TopBar({ source, theme, playing, onTheme, onPlay, queryId, onQueryChange, onRunQuery, queryPending, queryDirty, queryError }: TopBarProps) {
    return (
        <div className="top-bar">
            <div className="micro">{source}</div>

            <div className="query-controls">
                <label className="query-picker">
                    <select aria-label="Query preset" value={queryId} onChange={(event) => onQueryChange(event.target.value)} disabled={queryPending}>
                        {QUERY_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                </label>
                <button className="query-run" onClick={onRunQuery} disabled={queryPending}>
                    {queryPending ? "Running…" : "Run example"}
                </button>
            </div>

            <div className="theme-toggle">
                <button className={theme === "day" ? "active" : ""} onClick={() => onTheme("day")}>DAY</button>
                <button className={theme === "night" ? "active" : ""} onClick={() => onTheme("night")}>NIGHT</button>
            </div>

            <div className="divider" />

            <button className="icon-button" onClick={onPlay} disabled={queryPending} aria-label={playing ? "Pause" : "Play pipeline"}>
                {playing ? "❚❚" : "▶"}
            </button>
            {queryError ? <p className="query-feedback" role="alert">{queryError}</p>
                : <p className="query-feedback micro" role="status">{queryPending ? "Running selected example · previous results displayed" : queryDirty ? "New example selected · click Run example" : ""}</p>}
        </div>
    );
}
