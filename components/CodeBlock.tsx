"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CodeBlockProps = {
    lines: string[];
    current?: number;     // line to highlight
    past?: number[];      // lines that already ran
};

type Popped = {
    from: DOMRect;        // where the block sits in the panel, so the pop-out grows out of it
    open: boolean;        // false while it is flying in or back
};

const POP_MS = 650;       // length of the pop-out / shrink-back animation

// Shows a pipeline as code, with the current stage highlighted.
// Click the block: the whole block pops out into the middle of the scene, big. Click again: it goes back.
export default function CodeBlock({ lines, current = -1, past = [] }: CodeBlockProps) {
    const blockRef = useRef<HTMLPreElement>(null);
    const [popped, setPopped] = useState<Popped | null>(null);
    const [host, setHost] = useState<Element | null>(null);

    // The pop-out is drawn inside .app, so it keeps the day / night colours
    useEffect(() => {
        setHost(blockRef.current?.closest(".app") ?? document.body);
    }, []);

    function openBlock() {
        if (popped || !blockRef.current) {
            closeBlock();
            return;
        }
        setPopped({ from: blockRef.current.getBoundingClientRect(), open: false });
        // Next frame: switch to the open state so the CSS transition runs
        requestAnimationFrame(() => requestAnimationFrame(() =>
            setPopped((p) => (p ? { ...p, open: true } : p))
        ));
    }

    function closeBlock() {
        setPopped((p) => (p ? { ...p, open: false } : p));
        setTimeout(() => setPopped(null), POP_MS);
    }

    // The same lines, used both in the panel and in the pop-out
    const codeLines = lines.map((line, i) => {
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
    });

    // Closed state: small, on top of the block in the panel. Open state: centred in the free area.
    // Only transform and opacity animate, so the movement is one smooth curve.
    let cardStyle: React.CSSProperties = {};
    if (popped && !popped.open) {
        const { from } = popped;
        const centreX = window.innerWidth * (window.innerWidth > 900 ? 0.32 : 0.5);
        const dx = from.left + from.width / 2 - centreX;
        const dy = from.top + from.height / 2 - window.innerHeight / 2;
        cardStyle = {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`,
            opacity: 0,
        };
    }

    return (
        <>
            <pre
                className={popped ? "code-block popped" : "code-block"}
                ref={blockRef}
                onClick={openBlock}
                title="Click to enlarge"
            >
                {codeLines}
            </pre>

            {popped && host && createPortal(
                <div className={popped.open ? "code-pop open" : "code-pop"} onClick={closeBlock}>
                    <pre className="code-pop-card" style={cardStyle}>
                        <span className="code-pop-label">click to close</span>
                        {codeLines}
                    </pre>
                </div>,
                host
            )}
        </>
    );
}
