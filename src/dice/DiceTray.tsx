import { useCallback, useEffect, useRef, useState } from 'react';
import { createCryptoRng } from '@/engine/rng';
import { Icon } from '@/ui/Icon';
import controls from '@/ui/controls.module.css';
import { cx } from '@/ui/cx';
import styles from './DiceTray.module.css';
import type { DieType } from './geometry';
import { buttonThrow, throwFromGesture } from './gesture';
import type { PointerSample } from './gesture';
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
  const drag = useRef<PointerSample[] | null>(null);
  const [held, setHeld] = useState(false);
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
    async ({ strength, direction }: { strength: number; direction: number }) => {
      if (phaseRef.current !== 'ready' || !scene.current) return;
      setPhase('rolling');
      const origin = scene.current.handPosition();
      const { simulateUntilFlat } = await import('./sim');
      const sim = simulateUntilFlat(
        plan.dice.map((d) => d.type as DieType),
        { strength, direction, origin },
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
        void throwDice(buttonThrow(randomUnit));
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
        className={cx(styles.canvas, phase === 'ready' && styles.grab, held && styles.grabbing)}
        onPointerDown={(e) => {
          if (phaseRef.current !== 'ready' || !scene.current) return;
          // Keep the pointer even if it leaves the canvas, so letting go anywhere throws.
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drag.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
          scene.current.hold(...scene.current.pointerToTray(e.clientX, e.clientY));
          setHeld(true);
        }}
        onPointerMove={(e) => {
          const samples = drag.current;
          if (!samples || !scene.current) return;
          samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          if (samples.length > 40) samples.splice(0, samples.length - 40);
          scene.current.hold(...scene.current.pointerToTray(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          const samples = drag.current;
          drag.current = null;
          setHeld(false);
          if (!samples) return;
          samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          void throwDice(throwFromGesture(samples, randomUnit));
        }}
        onPointerCancel={() => {
          drag.current = null;
          setHeld(false);
        }}
      />
      <div className={styles.hud} aria-live="assertive">
        {phase === 'loading' && <span className={styles.hint}>Fetching the dice…</span>}
        {phase === 'ready' && (
          <>
            <span className={styles.hint}>{held ? 'Flick up and let go to throw' : 'Press anywhere to pick up the dice, then flick and let go. Or press Space.'}</span>
            <button type="button" className={cx(controls.btn, controls.primary, controls.large)} onClick={() => void throwDice(buttonThrow(randomUnit))} autoFocus>
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
