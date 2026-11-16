'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Cell } from '@/lib/app';

/**
 * Аудиторияның 3D көрінісі: әр студент — бір блок.
 * Бар студент — биік ақ блок, жоқ студент — жерге сіңген қызыл блок.
 * Қара фонға арналған.
 */
const LOOK: Record<string, { h: number; color: number }> = {
  present: { h: 1.0, color: 0xffffff },
  late: { h: 0.6, color: 0xb4b4b4 },
  absent: { h: 0.14, color: 0xe30613 },
  sick: { h: 0.14, color: 0x7d0a12 },
  excused: { h: 0.14, color: 0x767676 },
  exempt: { h: 0.36, color: 0x767676 },
  none: { h: 0.05, color: 0x3d3d3d },
};

type Props = {
  /** Топтар бойынша күйлер; әр топ жеке «аралға» орналасады */
  clusters: Cell[][];
  className?: string;
};

function layout(clusters: Cell[][]) {
  const pos: [number, number][] = [];
  let x0 = 0;
  let depth = 0;
  for (const c of clusters) {
    const rows = clusters.length > 1 ? Math.max(1, Math.round(Math.sqrt(c.length))) : c.length > 18 ? 3 : c.length > 8 ? 2 : 1;
    const cols = Math.ceil(c.length / rows);
    c.forEach((_, i) => pos.push([x0 + (i % cols), Math.floor(i / cols)]));
    depth = Math.max(depth, rows);
    x0 += cols + 1.1;
  }
  const width = x0 - 1.1;
  // Ортаға келтіру
  return { pos: pos.map(([x, z]) => [x - (width - 1) / 2, z - (depth - 1) / 2] as [number, number]), width, depth };
}

export function SeatField({ clusters, className }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const flat = clusters.flat();
  const live = useRef(flat);
  const wake = useRef<() => void>(() => {});
  // Блок саны немесе топтарға бөлінуі өзгергенде ғана сахна қайта құрылады
  const signature = clusters.map((c) => c.length).join(',');
  const statusKey = flat.map((s) => s ?? '-').join(',');

  useEffect(() => {
    live.current = flat;
    wake.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey]);

  useEffect(() => {
    const el = wrap.current;
    const n = live.current.length;
    if (!el || !n) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // WebGL жоқ құрылғыда жай ғана көрсетілмейді
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';

    const { pos, width, depth } = layout(clusters);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const pivot = new THREE.Group();
    scene.add(pivot);

    const geometry = new RoundedBoxGeometry(0.8, 1, 0.8, 3, 0.085);
    geometry.translate(0, 0.5, 0);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.08 });
    const mesh = new THREE.InstancedMesh(geometry, material, n);
    pivot.add(mesh);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(-4, 9, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff3040, 0.45);
    rim.position.set(8, 3, -6);
    scene.add(rim);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const h = new Float32Array(n).fill(reduce ? -1 : 0.001);
    const col = Array.from({ length: n }, () => new THREE.Color(0x2e2e2e));
    const target = new THREE.Color();
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    // Кіру толқыны: блоктар бір бұрыштан бастап кезекпен көтеріледі
    const delay = pos.map(([x, z]) => (reduce ? 0 : 120 + (x + width / 2 + (z + depth / 2) * 1.6) * 34));

    function fit() {
      const w = el!.clientWidth;
      const ht = el!.clientHeight;
      if (!w || !ht) return;
      renderer.setSize(w, ht, false);
      const aspect = w / ht;
      camera.position.set(10, 9.5, 10);
      camera.lookAt(0, 0.35, 0);
      camera.updateMatrixWorld();
      // Блоктар алаңының шеткі нүктелерін камера кеңістігіне түсіріп, кадрды дәл сыйғызамыз
      const inv = camera.matrixWorldInverse;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const sx of [-1, 1]) for (const y of [0, 1]) for (const sz of [-1, 1]) {
        p.set(sx * (width / 2 + 0.25), y, sz * (depth / 2 + 0.25)).applyMatrix4(inv);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      const halfH = (Math.max((maxX - minX) / aspect, maxY - minY) * 1.03) / 2;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      camera.left = cx - halfH * aspect;
      camera.right = cx + halfH * aspect;
      camera.top = cy + halfH;
      camera.bottom = cy - halfH;
      camera.updateProjectionMatrix();
    }

    let raf = 0;
    let visible = true;
    let settled = false;
    let dragX = 0;
    let rotTarget = 0;
    const start = performance.now();
    let last = start;

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now - start;
      const k = 1 - Math.exp(-dt * 9);
      let moving = false;

      for (let i = 0; i < n; i++) {
        const look = LOOK[live.current[i] ?? 'none'];
        if (h[i] < 0) {
          h[i] = look.h;
          col[i].setHex(look.color);
        } else if (elapsed >= delay[i]) {
          const dh = look.h - h[i];
          if (Math.abs(dh) > 0.002) {
            h[i] += dh * k;
            moving = true;
          } else h[i] = look.h;
          col[i].lerp(target.setHex(look.color), Math.min(1, k * 1.4));
        } else moving = true;
        p.set(pos[i][0], 0, pos[i][1]);
        scale.set(1, Math.max(h[i], 0.001), 1);
        mesh.setMatrixAt(i, m.compose(p, q, scale));
        mesh.setColorAt(i, col[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      // Баяу тербеліс + саусақпен бұру
      const sway = reduce ? 0 : Math.sin(elapsed / 2600) * 0.07;
      const goal = rotTarget + sway;
      pivot.rotation.y += (goal - pivot.rotation.y) * Math.min(1, dt * 6);
      rotTarget *= 1 - Math.min(1, dt * 1.2);

      renderer.render(scene, camera);
      settled = !moving;
      if (visible && (!reduce || moving || Math.abs(rotTarget) > 0.002)) raf = requestAnimationFrame(frame);
    }
    const kick = () => {
      if (!raf && visible) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    wake.current = kick;

    const ro = new ResizeObserver(() => {
      fit();
      kick();
    });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && !document.hidden;
      kick();
    });
    io.observe(el);
    const onVis = () => {
      visible = !document.hidden;
      kick();
    };
    document.addEventListener('visibilitychange', onVis);

    const canvas = renderer.domElement;
    const onDown = (e: PointerEvent) => (dragX = e.clientX);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        // Тінтуірдің орны бойынша жеңіл бұрылу
        const r = canvas.getBoundingClientRect();
        rotTarget = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
      } else {
        rotTarget = THREE.MathUtils.clamp(rotTarget + (e.clientX - dragX) * 0.006, -0.6, 0.6);
        dragX = e.clientX;
      }
      kick();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);

    fit();
    kick();
    void settled;

    return () => {
      cancelAnimationFrame(raf);
      wake.current = () => {};
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      renderer.dispose();
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return <div ref={wrap} className={className} aria-hidden />;
}
