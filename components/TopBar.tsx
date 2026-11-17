import { Theme } from "@/lib/types";

type TopBarProps = {
    source: string;
    theme: Theme;
    playing: boolean;
    onTheme: (theme: Theme) => void;
    onPlay: () => void;
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
export function TopBar({ source, theme, playing, onTheme, onPlay }: TopBarProps) {
    return (
        <div className="top-bar">
            <div className="micro">{source}</div>

            <div className="theme-toggle">
                <button className={theme === "day" ? "active" : ""} onClick={() => onTheme("day")}>DAY</button>
                <button className={theme === "night" ? "active" : ""} onClick={() => onTheme("night")}>NIGHT</button>
            </div>

            <div className="divider" />

            <button className="icon-button" onClick={onPlay} aria-label={playing ? "Pause" : "Play pipeline"}>
                {playing ? "❚❚" : "▶"}
            </button>
        </div>
    );
}
