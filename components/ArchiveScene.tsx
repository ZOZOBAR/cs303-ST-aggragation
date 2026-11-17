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
    theme: Theme;
    onSelect: (genre: number) => void;
};

// One colour per genre (muted palette)
const PALETTE = ["#c8553d", "#e2b04a", "#e9a6a0", "#4d5a6a", "#8fa58a", "#2f6f73", "#5b3a4e", "#d98b6a", "#7aa0c4", "#3b3f46"];

// Scene colours and light strength for each theme
const THEMES = {
    day: { bg: "#ebe7e0", card: "#f4f1eb", rack: "#d9d3c8", dim: "#d6d1c8", ground: "#bdb6aa", key: 2.2, ambient: 0.9, env: 0.55 },
    night: { bg: "#12151b", card: "#cfd2d8", rack: "#262a33", dim: "#2a2e36", ground: "#0b0d12", key: 1.5, ambient: 0.35, env: 0.35 },
};

// Card size: thickness, height, depth
const CARD_W = 0.045;
const CARD_H = 0.78;
const CARD_D = 0.56;

// Rack layout
const RACK_X0 = -3.2;
const RACK_Z0 = -3.4;
const RACK_GAP = 0.82;
const PULL_Z = 0.45;
const PULL_Y = 0.55;

// Seeded random numbers, so the layout is the same on every visit
function makeRandom(seed: number) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return value / 2147483647;
    };
}

// The 3D archive. It is a client component because three.js needs the browser (canvas, WebGL).
// React gives it the current stage / selection / theme; the animation loop reads them every frame.
export default function ArchiveScene({ data, stage, selected, theme, onSelect }: ArchiveSceneProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const labelsRef = useRef<HTMLDivElement>(null);

    // Latest props for the animation loop (the loop is created once and must not restart on every render)
    const liveRef = useRef({ stage, selected, theme, onSelect });

    useEffect(() => {
        liveRef.current = { stage, selected, theme, onSelect };
    }, [stage, selected, theme, onSelect]);

    useEffect(() => {
        const host = hostRef.current;
        const labelHost = labelsRef.current;
        if (!host || !labelHost) {
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
        scene.fog = new THREE.Fog(colors.bg, 11, 26);

        // Soft reflections from a simple built-in "room"
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTexture;
        scene.environmentIntensity = colors.env;

        const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(-7.4, 9.4, 13.2);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(1.5, -0.3, 0.6);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.minDistance = 7;
        controls.maxDistance = 24;
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
        Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
        key.shadow.bias = -0.0004;
        key.shadow.radius = 4;
        scene.add(key);

        const floorMaterial = new THREE.MeshStandardMaterial({ color: colors.bg, roughness: 1 });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        /* ---------- cards: one InstancedMesh draws all of them ---------- */
        const cardGeometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
        cardGeometry.translate(0, CARD_H / 2, 0);
        const cardMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.2 });
        const cardMesh = new THREE.InstancedMesh(cardGeometry, cardMaterial, cards.length);
        cardMesh.castShadow = true;
        cardMesh.receiveShadow = true;
        cardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(cardMesh);

        const genreColors = PALETTE.map((hex) => new THREE.Color(hex));

        // Where each card stands on the floor before grouping (a slightly messy grid)
        const COLUMNS = 36;
        const order = cards.map((_, i) => i).sort(() => random() - 0.5);
        const floorSpot = new Array(cards.length);
        order.forEach((cardIndex, k) => {
            const column = k % COLUMNS;
            const row = Math.floor(k / COLUMNS);
            floorSpot[cardIndex] = {
                x: -6.4 + column * 0.36 + (random() - 0.5) * 0.08,
                z: -5.2 + row * 0.42 + (random() - 0.5) * 0.1,
                ry: (random() - 0.5) * 0.22,
                sy: 0.75 + random() * 0.5,
            };
        });

        // Position of each card inside its rack
        const slot = new Array(cards.length).fill(0);
        const rackSize = genres.map(() => 0);
        cards.forEach((card, i) => {
            if (card.pass) {
                slot[i] = rackSize[card.genre]++;
            }
        });
        const pitch = Math.min(0.072, 7.5 / Math.max(1, ...rackSize));

        // Current and target state of every card (we move "current" a bit towards "target" each frame)
        const current = cards.map((_, i) => ({ ...floorSpot[i], y: 0, color: new THREE.Color(colors.card) }));
        const target = cards.map(() => ({ x: 0, y: 0, z: 0, ry: 0, sy: 1, color: new THREE.Color() }));

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

            const label = document.createElement("div");
            label.className = "rack-label";
            label.innerHTML = `<span class="rank"></span><span class="name">${name.toUpperCase()}</span><br/><span class="count">${counts[g].toLocaleString("en-US")}</span>`;
            labelHost.appendChild(label);

            return { genre: g, length, base, hit, group, label, z: 0, targetZ: 0, rank: g, pull: 0, visible: 0, dim: 0 };
        });

        const alphabetical = genres.map((_, g) => g).sort((a, b) => genres[a].localeCompare(genres[b]));
        const byCount = genres.map((_, g) => g).sort((a, b) => counts[b] - counts[a]);

        function shelve(orderList: number[]) {
            orderList.forEach((g, i) => {
                racks[g].targetZ = RACK_Z0 + i * RACK_GAP;
                racks[g].rank = i;
            });
        }
        shelve(alphabetical);
        racks.forEach((rack) => (rack.z = rack.targetZ));

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
            scene.fog?.color.set(colors.bg);
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
        let hovered = -1;
        let downAt: [number, number] | null = null;

        function pick(event: PointerEvent): number {
            if (liveRef.current.stage < 3) {
                return -1;
            }
            pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
            raycaster.setFromCamera(pointer, camera);
            const hit = raycaster.intersectObjects(racks.map((rack) => rack.hit), false)[0];
            return hit ? hit.object.userData.genre : -1;
        }

        function handleMove(event: PointerEvent) {
            hovered = pick(event);
            renderer.domElement.style.cursor = hovered >= 0 ? "pointer" : "grab";
        }

        function handleDown(event: PointerEvent) {
            downAt = [event.clientX, event.clientY];
        }

        function handleUp(event: PointerEvent) {
            // Ignore drags (orbiting the camera), only react to clicks
            if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 5) {
                return;
            }
            const g = pick(event);
            const { selected: selectedNow, onSelect: select } = liveRef.current;
            select(g >= 0 && g !== selectedNow ? g : -1);
        }

        renderer.domElement.addEventListener("pointermove", handleMove);
        renderer.domElement.addEventListener("pointerdown", handleDown);
        renderer.domElement.addEventListener("pointerup", handleUp);

        function handleResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            composer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener("resize", handleResize);

        /* ---------- animation loop ---------- */
        const matrix = new THREE.Matrix4();
        const rotation = new THREE.Quaternion();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const projected = new THREE.Vector3();
        const focusPoint = new THREE.Vector3();
        const accent = new THREE.Color("#ff5b2e");
        const bg = new THREE.Color();
        const card = new THREE.Color();
        const dim = new THREE.Color();
        const blended = new THREE.Color();
        const clock = new THREE.Clock();
        let frameId = 0;

        function tick() {
            const { stage: s, selected: sel, theme: th } = liveRef.current;
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
            dim.set(colors.dim);

            // Racks: order, visibility, pulled out, dimmed
            shelve(s >= 4 ? byCount : alphabetical);
            racks.forEach((rack) => {
                const targetVisible = s >= 3 ? 1 : 0;
                const targetPull = rack.genre === sel ? 1 : 0;
                const targetDim = (s >= 5 && rack.rank >= LIMIT) || (sel >= 0 && rack.genre !== sel) ? 1 : 0;

                rack.z += (rack.targetZ - rack.z) * ease;
                rack.visible += (targetVisible - rack.visible) * ease;
                rack.pull += (targetPull - rack.pull) * ease;
                rack.dim += (targetDim - rack.dim) * ease;

                rack.group.position.set(RACK_X0, rack.pull * PULL_Y, rack.z + rack.pull * PULL_Z);
                (rack.base.material as THREE.MeshStandardMaterial).opacity = rack.visible * (1 - rack.dim * 0.6);

                // Move the HTML label next to the rack
                projected.set(RACK_X0 - 0.2, 0.25 + rack.pull * PULL_Y, rack.z + rack.pull * PULL_Z).project(camera);
                rack.label.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`;
                rack.label.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`;
                rack.label.style.opacity = String(rack.visible * (1 - rack.dim * 0.7));
                (rack.label.querySelector(".rank") as HTMLElement).textContent = s >= 4 ? `#${rack.rank + 1}  ` : "";
                rack.label.classList.toggle("active", hovered === rack.genre || sel === rack.genre);
            });

            // Cards: work out where each one should be for the current stage
            cards.forEach((c, i) => {
                const goal = target[i];
                const spot = floorSpot[i];
                const rack = racks[c.genre];

                if (s === 0 || (s < 3 && c.pass)) {
                    // On the floor (raw collection, $match, $unwind)
                    goal.x = spot.x;
                    goal.z = spot.z;
                    goal.ry = spot.ry;
                    goal.sy = spot.sy;
                    goal.y = s === 2 ? 0.06 + Math.sin(time * 1.4 + i) * 0.03 : 0;
                    goal.color.copy(s === 2 ? genreColors[c.genre] : card);
                } else if (!c.pass) {
                    // Filtered out by $match: sink into the floor
                    goal.x = spot.x;
                    goal.z = spot.z;
                    goal.ry = spot.ry;
                    goal.y = -0.02;
                    goal.sy = 0.0015;
                    goal.color.copy(bg);
                } else {
                    // Filed into its rack ($group, $sort, $limit)
                    goal.x = RACK_X0 + slot[i] * pitch;
                    goal.z = rack.z + rack.pull * PULL_Z;
                    goal.y = 0.05 + rack.pull * PULL_Y;
                    goal.ry = 0;
                    goal.sy = 1 - rack.dim * 0.55;
                    goal.color.copy(genreColors[c.genre]).lerp(dim, rack.dim * 0.85);
                }

                // Move a little towards the goal (each card at a slightly different speed)
                const now = current[i];
                const speed = easeCards * (0.55 + ((i * 7919) % 100) / 140);
                now.x += (goal.x - now.x) * speed;
                now.y += (goal.y - now.y) * speed;
                now.z += (goal.z - now.z) * speed;
                now.ry += (goal.ry - now.ry) * speed;
                now.sy += (goal.sy - now.sy) * speed;

                blended.copy(goal.color);
                if (hovered === c.genre && s >= 3 && c.pass && sel < 0) {
                    blended.lerp(accent, 0.35);
                }
                now.color.lerp(blended, ease);

                rotation.setFromAxisAngle(up, now.ry);
                position.set(now.x, now.y, now.z);
                scale.set(1, Math.max(now.sy, 0.001), 1);
                matrix.compose(position, rotation, scale);
                cardMesh.setMatrixAt(i, matrix);
                cardMesh.setColorAt(i, now.color);
            });
            cardMesh.instanceMatrix.needsUpdate = true;
            if (cardMesh.instanceColor) {
                cardMesh.instanceColor.needsUpdate = true;
            }

            // Keep the selected rack in focus, otherwise focus the centre of the scene
            controls.update();
            if (sel >= 0) {
                focusPoint.set(RACK_X0 + racks[sel].length / 2, 0.4, racks[sel].z + PULL_Z);
            } else {
                focusPoint.copy(controls.target);
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
            envTexture.dispose();
            pmrem.dispose();
            renderer.dispose();
            host.removeChild(renderer.domElement);
            labelHost.innerHTML = "";
        };
    }, [data]);

    return (
        <>
            <div className="scene" ref={hostRef} />
            <div className="scene-labels" ref={labelsRef} />
        </>
    );
}
