"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ArchiveData, Theme } from "@/lib/types";
import { LIMIT } from "@/lib/pipeline";

type ArchiveSceneProps = {
    data: ArchiveData;
    stage: number;
    selected: number;
    selectedCard: number;
    theme: Theme;
    onSelect: (genre: number) => void;
    onSelectCard: (card: number) => void;
};

// One colour per genre (muted palette)
const PALETTE = [
    "#c8553d", "#e2b04a", "#e9a6a0", "#4d5a6a", "#8fa58a", "#2f6f73", "#5b3a4e", "#d98b6a", "#7aa0c4", "#3b3f46",
    "#a3b18a", "#b5838d", "#6d597a", "#e07a5f", "#81b29a", "#f2cc8f", "#3d405b", "#9c6644", "#7f8fa6", "#c9ada7",
];

// Scene colours and light strength for each theme
const THEMES = {
    day: { bg: "#ebe7e0", card: "#f4f1eb", other: "#b9b3a8", rack: "#d9d3c8", dim: "#d6d1c8", ink: "#1c1d20", ground: "#bdb6aa", key: 2.2, ambient: 0.9, env: 0.55 },
    night: { bg: "#12151b", card: "#cfd2d8", other: "#4a505b", rack: "#262a33", dim: "#2a2e36", ink: "#ecebe6", ground: "#0b0d12", key: 1.5, ambient: 0.35, env: 0.35 },
};

// Card size: thickness, height, depth
const CARD_W = 0.045;
const CARD_H = 0.78;
const CARD_D = 0.56;

// Floor grid (one spot per sampled game)
const SPOT_X = 0.52;      // wide enough for a game's copies to fan out at $unwind
const SPOT_Z = 0.46;
const FAN = 0.1;          // distance between the copies of one game after $unwind

// Racks
const RACK_GAP = 1.4;    // room between racks for the floor labels
const LABEL_W = 3.6;      // floor label size (world units)
const LABEL_H = 1.1;
const PULL_Z = 0.45;      // how far a clicked rack comes forward
const PULL_Y = 0.55;      // how high a clicked rack rises
const HOVER_Y = 0.14;     // how high a rack rises under the mouse
const CARD_POP_Z = 0.55;  // how far a clicked card slides out of its rack
const CARD_POP_Y = 0.16;
const FLOOR_POP_Y = 0.5;  // a clicked card on the floor rises...
const FLOOR_POP_T = 0.35; // ...and leans towards the camera
const FILE_DELAY = 0.5;   // $unwind → $group: cards leave one after another over this many seconds

// Camera: fixed viewing angle, distance fitted to the data
const VIEW_DIR = new THREE.Vector3(-8.9, 9.7, 12.6).normalize();
const PANEL_SHARE = 0.36; // part of a wide screen covered by the info panel

// Seeded random numbers, so the layout is the same on every visit
function makeRandom(seed: number) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return value / 2147483647;
    };
}

// Draws a rack's floor label (rank + count on top, big genre name below) into a canvas
function drawLabel(canvas: HTMLCanvasElement, name: string, top: string) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";

    ctx.globalAlpha = 0.8;
    ctx.font = '500 58px "JetBrains Mono", monospace';
    ctx.fillText(top, width - 8, 70);

    // Shrink long names (e.g. "MASSIVELY MULTIPLAYER") so they fit
    ctx.globalAlpha = 1;
    let size = 150;
    ctx.font = `700 ${size}px "Space Grotesk", sans-serif`;
    while (ctx.measureText(name).width > width - 16 && size > 40) {
        size -= 4;
        ctx.font = `700 ${size}px "Space Grotesk", sans-serif`;
    }
    ctx.fillText(name, width - 8, height - 36);
}

// The 3D archive. It is a client component because three.js needs the browser (canvas, WebGL).
// React gives it the current stage / selection / theme; the animation loop reads them every frame.
export default function ArchiveScene({ data, stage, selected, selectedCard, theme, onSelect, onSelectCard }: ArchiveSceneProps) {
    const hostRef = useRef<HTMLDivElement>(null);

    // Latest props for the animation loop (the loop is created once and must not restart on every render)
    const liveRef = useRef({ stage, selected, selectedCard, theme, onSelect, onSelectCard });

    useEffect(() => {
        liveRef.current = { stage, selected, selectedCard, theme, onSelect, onSelectCard };
    }, [stage, selected, selectedCard, theme, onSelect, onSelectCard]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) {
            return;
        }

        const { genres, counts, cards } = data;
        const random = makeRandom(11);

        /* ---------- renderer, scene, camera ---------- */
        let colors = THEMES[liveRef.current.theme];
        let currentTheme = liveRef.current.theme;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(colors.bg);
        const fog = new THREE.Fog(colors.bg, 11, 26);
        scene.fog = fog;

        // Soft reflections from a simple built-in "room"
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTexture;
        scene.environmentIntensity = colors.env;

        const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 200);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.minDistance = 4;
        controls.maxDistance = 60;
        controls.minPolarAngle = Math.PI * 0.18;
        controls.maxPolarAngle = Math.PI * 0.44;
        controls.enablePan = false;

        /* ---------- lights and floor ---------- */
        const hemi = new THREE.HemisphereLight("#ffffff", colors.ground, colors.ambient);
        scene.add(hemi);

        const key = new THREE.DirectionalLight("#fff6ea", colors.key);
        key.position.set(-6, 12, 7);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.bias = -0.0004;
        key.shadow.radius = 4;
        scene.add(key);

        const floorMaterial = new THREE.MeshStandardMaterial({ color: colors.bg, roughness: 1 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        /* ---------- floor layout: one spot per sampled game, centred on the origin ---------- */
        const docCount = cards.reduce((max, c) => Math.max(max, c.doc + 1), 0);
        const columns = Math.max(1, Math.ceil(Math.sqrt(docCount * 1.6)));
        const rows = Math.max(1, Math.ceil(docCount / columns));
        const order = Array.from({ length: docCount }, (_, i) => i).sort(() => random() - 0.5);
        const docSpot = new Array(docCount);
        order.forEach((docIndex, k) => {
            const column = k % columns;
            const row = Math.floor(k / columns);
            docSpot[docIndex] = {
                x: (column - (columns - 1) / 2) * SPOT_X + (random() - 0.5) * 0.08,
                z: (row - (rows - 1) / 2) * SPOT_Z + (random() - 0.5) * 0.08,
                ry: (random() - 0.5) * 0.22,
                sy: 0.75 + random() * 0.5,
            };
        });
        const floorWidth = columns * SPOT_X + 1;
        const floorDepth = rows * SPOT_Z + 1;

        /* ---------- cards: one InstancedMesh draws all of them ---------- */
        const cardGeometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
        cardGeometry.translate(0, CARD_H / 2, 0);
        const cardMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.2 });
        const cardMesh = new THREE.InstancedMesh(cardGeometry, cardMaterial, Math.max(1, cards.length));
        cardMesh.count = cards.length;
        cardMesh.castShadow = true;
        cardMesh.receiveShadow = true;
        cardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(cardMesh);

        const genreColors = PALETTE.map((hex) => new THREE.Color(hex));

        // Position of each card inside its rack
        const slot = new Array(cards.length).fill(0);
        const rackSize = genres.map(() => 0);
        cards.forEach((card, i) => {
            if (card.pass && card.genre >= 0) {
                slot[i] = rackSize[card.genre]++;
            }
        });
        const pitch = Math.min(0.072, 7.5 / Math.max(1, ...rackSize));
        const longestRack = Math.max(1, ...rackSize) * pitch + 0.24;

        // Racks (with their floor labels on the left) are centred on the origin as well
        const rackX0 = (LABEL_W + 0.3 - longestRack) / 2;
        const rackZ0 = -((genres.length - 1) * RACK_GAP) / 2;
        const racksWidth = LABEL_W + 0.3 + longestRack + 1;
        const racksDepth = genres.length * RACK_GAP + 1.4;

        // Current and target state of every card (we move "current" a bit towards "target" each frame).
        // x / y / z is the card's own position. Once a card is filed into a rack, "attach" becomes 1
        // and the rack's movement (pull out, hover lift) is added on top — so the card and its rack
        // always move together as one piece. "pop" slides a single clicked card out of its rack.
        const current = cards.map((c) => ({ ...docSpot[c.doc], y: 0, attach: 0, pop: 0, color: new THREE.Color(colors.card) }));
        const target = cards.map(() => ({ x: 0, y: 0, z: 0, ry: 0, sy: 1, attach: 0, color: new THREE.Color() }));

        /* ---------- racks (one per group) ---------- */
        const racks = genres.map((name, g) => {
            const length = rackSize[g] * pitch + 0.24;

            const baseGeometry = new THREE.BoxGeometry(length, 0.05, CARD_D + 0.18);
            baseGeometry.translate(length / 2 - 0.12, 0.025, 0);
            const base = new THREE.Mesh(baseGeometry, new THREE.MeshStandardMaterial({ color: colors.rack, roughness: 0.8, transparent: true, opacity: 0 }));
            base.receiveShadow = true;

            // Invisible box used for mouse picking
            const hitGeometry = new THREE.BoxGeometry(length, CARD_H + 0.2, CARD_D + 0.3);
            hitGeometry.translate(length / 2 - 0.12, (CARD_H + 0.2) / 2, 0);
            const hit = new THREE.Mesh(hitGeometry, new THREE.MeshBasicMaterial({ visible: false }));
            hit.userData.genre = g;

            const group = new THREE.Group();
            group.add(base, hit);
            scene.add(group);

            // Big label lying on the floor to the left of the rack
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = Math.round(1024 * (LABEL_H / LABEL_W));
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 8;
            const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, color: colors.ink, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
            const label = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H), labelMaterial);
            label.rotation.x = -Math.PI / 2;
            scene.add(label);

            return {
                genre: g, name, length, base, hit, group, label, labelMaterial, canvas, texture, labelKey: "",
                z: 0, targetZ: 0, rank: g, pull: 0, hover: 0, visible: 0, dim: 0, liftY: 0, liftZ: 0,
            };
        });

        function redrawLabel(rack: (typeof racks)[number], showRank: boolean) {
            const count = counts[rack.genre].toLocaleString("en-US");
            const top = showRank ? `#${rack.rank + 1} · ${count}` : count;
            const keyText = `${top}|${rack.name}`;
            if (keyText === rack.labelKey) {
                return;
            }
            rack.labelKey = keyText;
            drawLabel(rack.canvas, rack.name.toUpperCase(), top);
            rack.texture.needsUpdate = true;
        }

        // Redraw once the web fonts are ready (the first drawing may use a fallback font)
        document.fonts?.ready.then(() => racks.forEach((rack) => (rack.labelKey = "")));

        const alphabetical = genres.map((_, g) => g).sort((a, b) => genres[a].localeCompare(genres[b]));
        const byCount = genres.map((_, g) => g).sort((a, b) => counts[b] - counts[a]);

        function shelve(orderList: number[]) {
            orderList.forEach((g, i) => {
                racks[g].targetZ = rackZ0 + i * RACK_GAP;
                racks[g].rank = i;
            });
        }
        shelve(alphabetical);
        racks.forEach((rack) => (rack.z = rack.targetZ));

        /* ---------- camera framing: centre and fit whatever is on screen ---------- */
        const frameTarget = new THREE.Vector3();
        let frameDistance = 20;
        let framing = false;   // true while the camera is moving to frame the data
        let lastFramedStage = -1;

        function updateFrameGoal(s: number) {
            const width = s >= 3 ? racksWidth : floorWidth;
            const depth = s >= 3 ? racksDepth : floorDepth;
            const radius = 0.5 * Math.hypot(width, depth, CARD_H * 2);

            // Fit the radius into the free part of the screen (left of the info panel on wide screens)
            const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
            const share = window.innerWidth > 900 ? 1 - PANEL_SHARE : 1;
            const halfH = Math.atan(Math.tan(halfV) * camera.aspect * share);
            frameDistance = (radius / Math.sin(Math.min(halfV, halfH))) * 0.8;
            frameTarget.set(0, 0, s >= 3 ? 0.2 : 0);

            // Shadows and fog follow the size of the scene
            const extent = Math.max(width, depth) * 0.75 + 2;
            Object.assign(key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: extent * 4 });
            key.shadow.camera.updateProjectionMatrix();
        }

        // Shift the picture left so the centre of the data sits in the middle of the free area
        function applyViewOffset() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (w > 900) {
                camera.setViewOffset(w, h, w * PANEL_SHARE * 0.5, 0, w, h);
            } else {
                camera.clearViewOffset();
            }
        }
        applyViewOffset();

        updateFrameGoal(liveRef.current.stage);
        controls.target.copy(frameTarget);
        camera.position.copy(frameTarget).addScaledVector(VIEW_DIR, frameDistance);
        lastFramedStage = liveRef.current.stage;

        // Stop the automatic framing as soon as the user orbits or zooms
        controls.addEventListener("start", () => (framing = false));

        /* ---------- depth of field (post-processing) ---------- */
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bokeh = new BokehPass(scene, camera, { focus: 14, aperture: 0.0016, maxblur: 0.006 });
        composer.addPass(bokeh);
        composer.addPass(new OutputPass());

        /* ---------- theme switch ---------- */
        function applyTheme(name: Theme) {
            colors = THEMES[name];
            (scene.background as THREE.Color).set(colors.bg);
            fog.color.set(colors.bg);
            floorMaterial.color.set(colors.bg);
            hemi.intensity = colors.ambient;
            hemi.groundColor.set(colors.ground);
            key.intensity = colors.key;
            scene.environmentIntensity = colors.env;
            racks.forEach((rack) => (rack.base.material as THREE.MeshStandardMaterial).color.set(colors.rack));
        }

        /* ---------- mouse picking ---------- */
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const dropped = new Array(cards.length).fill(false);  // cards sunk into the floor right now
        let hovered = -1;       // rack under the mouse
        let hoveredCard = -1;   // card under the mouse (only inside the pulled-out rack)
        let downAt: [number, number] | null = null;

        // Find what is under the mouse: a card of the open rack first, otherwise a rack
        function pick(event: PointerEvent): { genre: number; card: number } {
            const none = { genre: -1, card: -1 };
            const { stage: s, selected: sel } = liveRef.current;

            pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
            raycaster.setFromCamera(pointer, camera);

            // Before $group every card on the floor can be clicked (except the ones that sank)
            if (s < 3) {
                cardMesh.computeBoundingSphere();
                const floorHit = raycaster
                    .intersectObject(cardMesh, false)
                    .find((h) => h.instanceId !== undefined && !dropped[h.instanceId]);
                return floorHit && floorHit.instanceId !== undefined ? { genre: -1, card: floorHit.instanceId } : none;
            }

            if (sel >= 0) {
                // Cards move every frame, so refresh the bounding sphere before testing them
                cardMesh.computeBoundingSphere();
                const cardHit = raycaster
                    .intersectObject(cardMesh, false)
                    .find((h) => h.instanceId !== undefined && cards[h.instanceId].genre === sel && cards[h.instanceId].pass);
                if (cardHit && cardHit.instanceId !== undefined) {
                    return { genre: sel, card: cardHit.instanceId };
                }
            }

            const rackHit = raycaster.intersectObjects(racks.map((rack) => rack.hit), false)[0];
            return rackHit ? { genre: rackHit.object.userData.genre, card: -1 } : none;
        }

        function handleMove(event: PointerEvent) {
            const hit = pick(event);
            hovered = hit.genre;
            hoveredCard = hit.card;
            renderer.domElement.style.cursor = hit.genre >= 0 || hit.card >= 0 ? "pointer" : "grab";
        }

        function handleDown(event: PointerEvent) {
            downAt = [event.clientX, event.clientY];
        }

        function handleUp(event: PointerEvent) {
            // Ignore drags (orbiting the camera), only react to clicks
            if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 5) {
                return;
            }
            const hit = pick(event);
            const { selected: sel, selectedCard: selCard, onSelect: select, onSelectCard: selectCard } = liveRef.current;

            if (hit.card >= 0) {
                // A card in the open rack: open it (or close it if it is already open)
                selectCard(hit.card === selCard ? -1 : hit.card);
            } else if (hit.genre >= 0 && hit.genre !== sel) {
                // Another rack: pull it out
                select(hit.genre);
            } else {
                // Same rack or empty space: put everything back
                select(-1);
            }
        }

        renderer.domElement.addEventListener("pointermove", handleMove);
        renderer.domElement.addEventListener("pointerdown", handleDown);
        renderer.domElement.addEventListener("pointerup", handleUp);

        function handleResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            applyViewOffset();
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            composer.setSize(window.innerWidth, window.innerHeight);
            updateFrameGoal(liveRef.current.stage);
            framing = true;
        }
        window.addEventListener("resize", handleResize);

        /* ---------- animation loop ---------- */
        const matrix = new THREE.Matrix4();
        const rotation = new THREE.Quaternion();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const offset = new THREE.Vector3();
        const focusPoint = new THREE.Vector3();
        const accent = new THREE.Color("#ff5b2e");
        const ink = new THREE.Color();
        const bg = new THREE.Color();
        const card = new THREE.Color();
        const other = new THREE.Color();
        const dim = new THREE.Color();
        const blended = new THREE.Color();
        const toCamera = new THREE.Vector3();
        const clock = new THREE.Clock();
        let frameId = 0;
        let fileStartedAt = -10;   // when the cards started moving from the floor into the racks
        let previousStage = liveRef.current.stage;

        function tick() {
            const { stage: s, selected: sel, selectedCard: selCard, theme: th } = liveRef.current;
            const dt = Math.min(clock.getDelta(), 0.05);
            const time = clock.elapsedTime;
            const ease = 1 - Math.pow(0.002, dt);
            const easeCards = 1 - Math.pow(0.03, dt);

            if (th !== currentTheme) {
                currentTheme = th;
                applyTheme(th);
            }
            bg.set(colors.bg);
            card.set(colors.card);
            other.set(colors.other);
            dim.set(colors.dim);
            ink.set(colors.ink);

            // $unwind → $group: remember the moment, so the cards can leave one after another
            if (s >= 3 && previousStage < 3) {
                fileStartedAt = time;
            }
            previousStage = s;

            // Re-frame the camera whenever the stage changes
            if (s !== lastFramedStage) {
                lastFramedStage = s;
                updateFrameGoal(s);
                framing = true;
            }
            if (framing) {
                controls.target.lerp(frameTarget, ease);
                offset.copy(camera.position).sub(controls.target);
                const distance = offset.length();
                offset.setLength(distance + (frameDistance - distance) * ease);
                camera.position.copy(controls.target).add(offset);
                // Stop once the camera has arrived (works the same on fast and slow computers)
                if (Math.abs(frameDistance - distance) < 0.02 && controls.target.distanceTo(frameTarget) < 0.02) {
                    framing = false;
                }
            }

            // Fog follows the camera distance, so near data is clear and the far edge fades out
            const viewDistance = camera.position.distanceTo(controls.target);
            fog.near = viewDistance * 0.8;
            fog.far = viewDistance * 2;

            // Racks: order, visibility, pulled out, hover lift, dimmed
            shelve(s >= 4 ? byCount : alphabetical);
            racks.forEach((rack) => {
                const targetVisible = s >= 3 ? 1 : 0;
                const targetPull = rack.genre === sel ? 1 : 0;
                const targetHover = s >= 3 && hovered === rack.genre && rack.genre !== sel ? 1 : 0;
                const targetDim = (s >= 5 && rack.rank >= LIMIT) || (sel >= 0 && rack.genre !== sel) ? 1 : 0;

                rack.z += (rack.targetZ - rack.z) * ease;
                rack.visible += (targetVisible - rack.visible) * ease;
                rack.pull += (targetPull - rack.pull) * ease;
                rack.hover += (targetHover - rack.hover) * ease * 1.5;
                rack.dim += (targetDim - rack.dim) * ease;

                // One position for the whole rack; the base and its cards both use it
                rack.liftY = rack.pull * PULL_Y + rack.hover * HOVER_Y;
                rack.liftZ = rack.z + rack.pull * PULL_Z;

                rack.group.position.set(rackX0, rack.liftY, rack.liftZ);
                (rack.base.material as THREE.MeshStandardMaterial).opacity = rack.visible * (1 - rack.dim * 0.6);

                // Floor label: stays on the floor, slides forward with the rack
                redrawLabel(rack, s >= 4);
                rack.label.position.set(rackX0 - 0.3 - LABEL_W / 2, 0.012, rack.liftZ);
                const active = hovered === rack.genre || sel === rack.genre ? 1 : 0;
                rack.labelMaterial.color.copy(ink).lerp(accent, active);
                rack.labelMaterial.opacity = rack.visible * (1 - rack.dim * 0.7);
            });

            // Cards: work out where each one should be for the current stage
            cards.forEach((c, i) => {
                const goal = target[i];
                const spot = docSpot[c.doc];
                const rack = c.genre >= 0 ? racks[c.genre] : null;
                const filed = s >= 3 && c.pass && rack !== null;

                // After $unwind, the copies of one game stand side by side instead of on top of each other
                const fan = s >= 2 ? (c.copy - (c.copies - 1) / 2) * FAN : 0;

                // Position inside the rack (rack position + slot), used once the card is filed
                const rackX = rackX0 + slot[i] * pitch;
                const rackY = 0.05 + (rack ? rack.liftY : 0);
                const rackZ = rack ? rack.liftZ : 0;

                const sinks =
                    (s >= 1 && !c.pass) ||              // $match: not played
                    (s >= 2 && c.genre === -1) ||       // $unwind: empty genres array
                    (s >= 3 && c.genre === -2);         // $group: genre outside the preview racks
                dropped[i] = sinks;

                if (filed && rack) {
                    // Filed into its rack ($group, $sort, $limit)
                    goal.x = rackX;
                    goal.y = rackY;
                    goal.z = rackZ;
                    goal.ry = 0;
                    goal.sy = 1 - rack.dim * 0.55;
                    goal.color.copy(genreColors[c.genre]).lerp(dim, rack.dim * 0.85);
                } else if (sinks) {
                    // Filtered out: sink into the floor
                    goal.x = spot.x + fan;
                    goal.z = spot.z;
                    goal.ry = spot.ry;
                    goal.y = -0.02;
                    goal.sy = 0.0015;
                    goal.color.copy(bg);
                } else {
                    // On the floor: one card per game, or its fanned-out copies after $unwind
                    goal.x = spot.x + fan;
                    goal.z = spot.z;
                    goal.ry = s >= 2 ? spot.ry * 0.3 : spot.ry;
                    goal.sy = spot.sy;
                    goal.y = s === 2 ? 0.06 + Math.sin(time * 1.4 + c.doc) * 0.03 : 0;
                    if (s === 2) {
                        goal.color.copy(c.genre >= 0 ? genreColors[c.genre] : other);
                    } else {
                        goal.color.copy(card);
                    }
                }
                goal.attach = filed ? 1 : 0;

                // Move a little towards the goal (each card at a slightly different speed,
                // so they arrive one after another when they are filed)
                const now = current[i];
                const variance = 0.55 + ((i * 7919) % 100) / 140;
                let speed = easeCards * variance;

                // Filing into a rack: each card waits its turn, then glides over more slowly
                const filing = goal.attach === 1 && now.attach < 0.98;
                if (filing) {
                    const delay = (((i * 7919) % 100) / 100) * FILE_DELAY;
                    speed = time - fileStartedAt < delay ? 0 : (1 - Math.pow(0.08, dt)) * variance;
                }

                now.x += (goal.x - now.x) * speed;
                now.y += (goal.y - now.y) * speed;
                now.z += (goal.z - now.z) * speed;
                now.ry += (goal.ry - now.ry) * speed;
                now.sy += (goal.sy - now.sy) * speed;
                now.attach += (goal.attach - now.attach) * speed;

                // A clicked card slides out; a hovered card in the open rack peeks out a little
                const popGoal = i === selCard ? 1 : i === hoveredCard && (s < 3 || sel === c.genre) ? 0.3 : 0;
                now.pop += (popGoal - now.pop) * ease * 1.5;

                blended.copy(goal.color);
                if (hovered === c.genre && filed && sel < 0) {
                    blended.lerp(accent, 0.35);
                }
                if (i === selCard) {
                    blended.lerp(accent, 0.3);
                }
                now.color.lerp(blended, ease);

                // Once attached, the card sits exactly at its rack slot, so it moves with the rack as one piece
                const a = now.attach;
                position.set(
                    now.x * (1 - a) + rackX * a,
                    now.y * (1 - a) + rackY * a,
                    now.z * (1 - a) + rackZ * a,
                );

                // Clicked card: slides out of the rack towards the side the camera is on,
                // or (on the floor) rises and leans towards the camera
                if (now.pop > 0.001) {
                    if (a > 0.5) {
                        const side = camera.position.z >= position.z ? 1 : -1;
                        position.y += now.pop * CARD_POP_Y;
                        position.z += now.pop * CARD_POP_Z * side;
                    } else {
                        toCamera.set(camera.position.x - position.x, 0, camera.position.z - position.z).normalize();
                        position.y += now.pop * FLOOR_POP_Y;
                        position.addScaledVector(toCamera, now.pop * FLOOR_POP_T);
                    }
                }
                rotation.setFromAxisAngle(up, now.ry);
                scale.set(1, Math.max(now.sy, 0.001), 1);
                matrix.compose(position, rotation, scale);
                cardMesh.setMatrixAt(i, matrix);
                cardMesh.setColorAt(i, now.color);

                if (i === selCard) {
                    focusPoint.copy(position);
                }
            });
            cardMesh.instanceMatrix.needsUpdate = true;
            if (cardMesh.instanceColor) {
                cardMesh.instanceColor.needsUpdate = true;
            }

            // Keep the opened card / rack in focus, otherwise focus the centre of the data
            controls.update();
            if (selCard < 0) {
                if (sel >= 0) {
                    focusPoint.set(rackX0 + racks[sel].length / 2, 0.4 + racks[sel].liftY, racks[sel].liftZ);
                } else {
                    focusPoint.copy(controls.target);
                }
            }
            const focus = bokeh.uniforms as unknown as { focus: { value: number } };
            focus.focus.value += (camera.position.distanceTo(focusPoint) - focus.focus.value) * ease;

            composer.render();
            frameId = requestAnimationFrame(tick);
        }

        cards.forEach((_, i) => cardMesh.setColorAt(i, current[i].color));
        tick();

        /* ---------- clean up when the component unmounts ---------- */
        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener("resize", handleResize);
            renderer.domElement.removeEventListener("pointermove", handleMove);
            renderer.domElement.removeEventListener("pointerdown", handleDown);
            renderer.domElement.removeEventListener("pointerup", handleUp);
            controls.dispose();
            composer.dispose();
            racks.forEach((rack) => rack.texture.dispose());
            envTexture.dispose();
            pmrem.dispose();
            renderer.dispose();
            host.removeChild(renderer.domElement);
        };
    }, [data]);

    return <div className="scene" ref={hostRef} />;
}
