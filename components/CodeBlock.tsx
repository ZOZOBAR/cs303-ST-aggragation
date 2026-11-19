"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CodeBlockProps = {
    lines: string[];
    current?: number;     // line to highlight
    past?: number[];      // lines that already ran
};

type Popped = {
    index: number;
    from: DOMRect;        // where the clicked line sits, so the pop-out grows out of it
    open: boolean;        // false while it is flying in or back
};

const POP_MS = 420;       // length of the pop-out / shrink-back animation

// Turns one pipeline line like `  {"$match":{...}},` into readable, indented JSON
function pretty(line: string) {
    const text = line.trim().replace(/,$/, "");
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

// Shows a pipeline as code, with the current stage highlighted.
// Click a line: it pops out into the middle of the scene, big and indented. Click again: it goes back.
export default function CodeBlock({ lines, current = -1, past = [] }: CodeBlockProps) {
    const blockRef = useRef<HTMLPreElement>(null);
    const [popped, setPopped] = useState<Popped | null>(null);
    const [host, setHost] = useState<Element | null>(null);

    // The pop-out is drawn inside .app, so it keeps the day / night colours
    useEffect(() => {
        setHost(blockRef.current?.closest(".app") ?? document.body);
    }, []);

    function openLine(index: number, event: React.MouseEvent<HTMLSpanElement>) {
        if (popped) {
            closeLine();
            return;
        }
        setPopped({ index, from: event.currentTarget.getBoundingClientRect(), open: false });
        // Next frame: switch to the open state so the CSS transition runs
        requestAnimationFrame(() => requestAnimationFrame(() =>
            setPopped((p) => (p ? { ...p, open: true } : p))
        ));
    }

    function closeLine() {
        setPopped((p) => (p ? { ...p, open: false } : p));
        setTimeout(() => setPopped(null), POP_MS);
    }

    // Closed state: a small box on top of the clicked line. Open state: centred in the free area.
    let cardStyle: React.CSSProperties = {};
    if (popped && !popped.open) {
        const { from } = popped;
        cardStyle = {
            left: from.left + from.width / 2,
            top: from.top + from.height / 2,
            transform: "translate(-50%, -50%) scale(0.3)",
            opacity: 0,
        };
    }

    return (
        <>
            <pre className="code-block" ref={blockRef}>
                {lines.map((line, i) => {
                    let className = "code-line";
                    if (i === current) {
                        className += " current";
                    } else if (past.includes(i)) {
                        className += " past";
                    }
                    if (popped?.index === i) {
                        className += " popped";
                    }
                    return (
                        <span key={i} className={className} onClick={(e) => openLine(i, e)}>
                            {line}
                        </span>
                    );
                })}
            </pre>

            {popped && host && createPortal(
                <div className={popped.open ? "code-pop open" : "code-pop"} onClick={closeLine}>
                    <pre className="code-pop-card" style={cardStyle}>
                        <span className="code-pop-label">line {popped.index + 1} · click to close</span>
                        {pretty(lines[popped.index])}
                    </pre>
                </div>,
                host
            )}
        </>
    );
}
