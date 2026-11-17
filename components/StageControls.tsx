import { STAGES } from "@/lib/pipeline";

type StageControlsProps = {
    stage: number;
    onChange: (stage: number) => void;
};

// Bottom-left: big stage number
export function StageCounter({ stage }: { stage: number }) {
    return (
        <div className="stage-counter">
            <div className="micro">Stage / Select</div>
            <div className="stage-number">
                {String(stage + 1).padStart(2, "0")}
                <small>/ {String(STAGES.length).padStart(2, "0")}</small>
            </div>
        </div>
    );
}

// Bottom-center: arrows and one tick per stage
export function StageScrubber({ stage, onChange }: StageControlsProps) {
    return (
        <div className="scrubber">
            <button className="scrubber-arrow" onClick={() => onChange(stage - 1)} aria-label="Previous stage">←</button>

            <div className="ticks">
                {STAGES.map((item, i) => {
                    let className = "tick";
                    if (i === stage) {
                        className += " active";
                    } else if (i < stage) {
                        className += " done";
                    }
                    return (
                        <button key={item.op} className={className} onClick={() => onChange(i)}>
                            <i />
                            <span>{item.op === "collection" ? "raw" : item.op}</span>
                        </button>
                    );
                })}
            </div>

            <button className="scrubber-arrow" onClick={() => onChange(stage + 1)} aria-label="Next stage">→</button>
        </div>
    );
}
