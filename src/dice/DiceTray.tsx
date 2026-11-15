import { useCallback, useEffect, useRef, useState } from 'react';
import { createCryptoRng } from '@/engine/rng';
import { Icon } from '@/ui/Icon';
import controls from '@/ui/controls.module.css';
import { cx } from '@/ui/cx';
import styles from './DiceTray.module.css';
import type { DieType } from './geometry';
import { planRoll } from './plan';
import type { RollPlan } from './plan';
import { quickRoll } from './roll';
import type { DiceRoller } from './roll';
import type { DiceScene } from './scene';

interface Request {
  die: number;
  plan: RollPlan;
  resolve(values: number[]): void;
}

const rng = createCryptoRng();
const randomUnit = () => (rng.int(1_000_000) - 1) / 1_000_000;

function cssColor(name: string, fallback: string, from: Element): string {
  return getComputedStyle(from).getPropertyValue(name).trim() || fallback;
}

/**
 * The 3D dice tray. `roller` is handed to the roll prompt: it opens the tray, waits for the player to
 * throw (click, drag-release or Space), plays the physics and resolves with the values.
 * Values always come from the cryptographic RNG; the animation is made to land on them.
 */
export function useDiceTray(onImpact?: (loudness: number) => void): { roller: DiceRoller; overlay: React.ReactNode } {
  const [request, setRequest] = useState<Request | null>(null);
  const roller = useCallback<DiceRoller>((die, count) => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return quickRoll(die, count);
    return new Promise<number[]>((resolve) => setRequest({ die, plan: planRoll(die, count, rng), resolve }));
  }, []);
  const finish = useCallback(() => setRequest(null), []);
  return { roller, overlay: request ? <DiceTray key={request.plan.values.join('-') + request.die} request={request} onClose={finish} onImpact={onImpact} /> : null };
}

function DiceTray({ request, onClose, onImpact }: { request: Request; onClose(): void; onImpact?: (loudness: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<DiceScene | null>(null);
  const drag = useRef<{ x: number; y: number; t: number } | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'rolling' | 'done'>('loading');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const { plan, die } = request;

  const finish = useCallback(() => {
    request.resolve(plan.values);
    onClose();
  }, [request, plan, onClose]);

  useEffect(() => {
    let live = true;
    let observer: ResizeObserver | null = null;
    void import('./scene').then(({ DiceScene: Scene, webglAvailable }) => {
      if (!live || !canvas.current || !root.current) return;
      if (!webglAvailable()) {
        // No WebGL: the result is still fair, it just is not animated.
        setPhase('done');
        setTimeout(() => live && finish(), 900);
        return;
      }
      const el = root.current;
      scene.current = new Scene(canvas.current, {
        body: cssColor('--accent', '#d9b45a', el),
        ink: cssColor('--accent-ink', '#1a1408', el),
        felt: '#16302a',
        rim: '#3a2a18',
      });
      scene.current.showInHand(plan.dice);
      observer = new ResizeObserver(() => scene.current?.resize());
      observer.observe(canvas.current);
      setPhase('ready');
    });
    return () => {
      live = false;
      observer?.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
    // The tray is mounted once per roll request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const throwDice = useCallback(
    async (strength: number, direction: number) => {
      if (phaseRef.current !== 'ready' || !scene.current) return;
      setPhase('rolling');
      const { simulateUntilFlat } = await import('./sim');
      const sim = simulateUntilFlat(
        plan.dice.map((d) => d.type as DieType),
        { strength, direction },
        randomUnit,
      );
      await scene.current?.play(plan.dice, sim, onImpact);
      setPhase('done');
      setTimeout(finish, 1100);
    },
    [plan, onImpact, finish],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        void throwDice(0.8 + randomUnit() * 0.5, (randomUnit() - 0.5) * 0.5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [throwDice]);

  const label = `${plan.values.length > 1 ? `${plan.values.length}d${die}` : `d${die}`}`;
  return (
    <div ref={root} className={styles.overlay} role="dialog" aria-modal="true" aria-label="Dice tray">
      <canvas
        ref={canvas}
        className={cx(styles.canvas, phase === 'ready' && styles.grab)}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, t: performance.now() };
        }}
        onPointerUp={(e) => {
          const start = drag.current;
          drag.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          const dt = Math.max(16, performance.now() - start.t);
          const speed = Math.hypot(dx, dy) / dt; // pixels per millisecond
          const dragged = Math.hypot(dx, dy) > 12;
          // A flick throws harder and in the direction of the drag; a plain click is a medium throw.
          const strength = dragged ? Math.min(1.6, 0.55 + speed * 0.9) : 0.8 + randomUnit() * 0.4;
          const direction = dragged ? Math.max(-0.7, Math.min(0.7, Math.atan2(dx, -dy))) : (randomUnit() - 0.5) * 0.5;
          void throwDice(strength, direction);
        }}
      />
      <div className={styles.hud} aria-live="assertive">
        {phase === 'loading' && <span className={styles.hint}>Fetching the dice…</span>}
        {phase === 'ready' && (
          <>
            <span className={styles.hint}>Click or flick the dice, or press Space, to throw</span>
            <button type="button" className={cx(controls.btn, controls.primary, controls.large)} onClick={() => void throwDice(0.8 + randomUnit() * 0.5, (randomUnit() - 0.5) * 0.5)} autoFocus>
              <Icon name="dice" size={22} /> Throw the {label}
            </button>
          </>
        )}
        {phase === 'done' && (
          <span className={styles.result}>
            <small>{label}</small>
            {plan.values.join(' and ')}
          </span>
        )}
      </div>
    </div>
  );
}
