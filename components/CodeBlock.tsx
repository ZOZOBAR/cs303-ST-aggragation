type CodeBlockProps = {
    lines: string[];
    current?: number;     // line to highlight
    past?: number[];      // lines that already ran
};

// Shows a pipeline as code, with the current stage highlighted
export default function CodeBlock({ lines, current = -1, past = [] }: CodeBlockProps) {
    return (
        <pre className="code-block">
            {lines.map((line, i) => {
                let className = "code-line";
                if (i === current) {
                    className += " current";
                } else if (past.includes(i)) {
                    className += " past";
                }
                return (
                    <span key={i} className={className}>
                        {line}
                    </span>
                );
            })}
        </pre>
    );
}
