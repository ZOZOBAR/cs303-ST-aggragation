import { Stage } from "@/lib/pipeline";

type StageControlsProps = {
    stage: number;
    stages: Stage[];
    disabled?: boolean;
    onChange: (stage: number) => void;
};

// Bottom-left: big stage number
export function StageCounter({ stage, total }: { stage: number; total: number }) {
    return (
        <div className="stage-counter">
            <div className="micro">Stage / Select</div>
            <div className="stage-number">
                {String(stage + 1).padStart(2, "0")}
                <small>/ {String(total).padStart(2, "0")}</small>
            </div>
        </div>
    );
}

// Bottom-center: arrows and one tick per stage
export function StageScrubber({ stage, stages, onChange, disabled = false }: StageControlsProps) {
    return (
        <div className="scrubber">
            <button className="scrubber-arrow" onClick={() => onChange(stage - 1)} disabled={disabled || stage === 0} aria-label="Previous stage">←</button>

            <div className="ticks">
                {stages.map((item, i) => {
                    let className = "tick";
                    if (i === stage) {
                        className += " active";
                    } else if (i < stage) {
                        className += " done";
                    }
                    return (
                        <button key={item.op} className={className} disabled={disabled} onClick={() => onChange(i)}>
                            <i />
                            <span>{item.op === "collection" ? "raw" : item.op}</span>
                        </button>
                    );
                })}
            </div>

            <button className="scrubber-arrow" onClick={() => onChange(stage + 1)} disabled={disabled || stage === stages.length - 1} aria-label="Next stage">→</button>
        </div>
    );
}
