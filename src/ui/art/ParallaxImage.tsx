import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSettings } from '@/app/settingsStore';
import { cx } from '../cx';
import { useDepthMap } from './useDepthMap';
import { FRAGMENT_SHADER, PARALLAX_AMPLITUDE, PARALLAX_FOCUS, PARALLAX_ZOOM, VERTEX_SHADER, coverScale, deviceTilt, easeIn, follow, pointerTilt, sway } from './parallax';
import type { Vec2 } from './parallax';
import styles from './ParallaxImage.module.css';

interface Props {
  /** Image store key of the picture (its depth map is stored next to it). */
  imageKey: string;
  /** Object URL of the picture. */
  url: string;
  alt: string;
  className?: string;
  /**
   * 'cover' fills the box like object-fit: cover. 'contain' sizes the box to the picture, at most `maxHeight`
   * tall (the full-screen view).
   */
  fit?: 'cover' | 'contain';
  maxHeight?: string;
  /** Stops the animation (for example while the full-screen copy is open on top). */
  paused?: boolean;
  /** Keeps everything below this height (0 top .. 1 bottom) still, such as a name plaque. */
  flatBelow?: number;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

function compile(gl: WebGLRenderingContext): { program: WebGLProgram; uniform(name: string): WebGLUniformLocation | null } | null {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  return { program, uniform: (name) => gl.getUniformLocation(program, name) };
}

function texture(gl: WebGLRenderingContext, unit: number, img: HTMLImageElement): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
}

/**
 * Draws a picture and its depth map as a living 2.5D scene: it sways slowly on its own, follows the mouse
 * while it is over the picture, and follows the device's tilt on phones and tablets. Returns false from the
 * setup when WebGL is missing, so the caller can show the flat picture.
 */
function useParallax(canvas: HTMLCanvasElement | null, url: string, depthUrl: string | null, paused: boolean, flatBelow: number, onFail: () => void, onAspect: (r: number) => void): void {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    if (!canvas || !depthUrl) return;
    let disposed = false;
    let frame = 0;
    let visible = true;
    const cleanups: Array<() => void> = [];

    void (async () => {
      let img: HTMLImageElement;
      let depth: HTMLImageElement;
      try {
        [img, depth] = await Promise.all([loadImage(url), loadImage(depthUrl)]);
      } catch {
        return onFail();
      }
      if (disposed) return;
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
      const prog = gl && compile(gl);
      if (!gl || !prog) return onFail();
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      onAspect(aspect);
      gl.useProgram(prog.program);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog.program, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      texture(gl, 0, img);
      texture(gl, 1, depth);
      gl.uniform1i(prog.uniform('uImage'), 0);
      gl.uniform1i(prog.uniform('uDepth'), 1);
      gl.uniform1f(prog.uniform('uFocus'), PARALLAX_FOCUS);
      gl.uniform1f(prog.uniform('uFlat'), flatBelow);
      const uOffset = prog.uniform('uOffset');
      const uScale = prog.uniform('uScale');
      const uZoom = prog.uniform('uZoom');

      const resize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        const s = coverScale(w / h, aspect);
        gl.uniform2f(uScale, s.x, s.y);
      };

      // Where the view is looking: the idle sway, unless the mouse or the device tilt is steering.
      let steer: Vec2 | null = null;
      let steerUntil = 0;
      let rest: number | null = null;
      let view: Vec2 = { x: 0, y: 0 };
      const onPointer = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        steer = pointerTilt(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
        steerUntil = performance.now() + 1500;
      };
      const onLeave = () => {
        steerUntil = 0;
      };
      const onTilt = (e: DeviceOrientationEvent) => {
        if (e.gamma === null || e.beta === null) return;
        rest ??= e.beta;
        steer = deviceTilt(e.gamma, e.beta, rest);
        steerUntil = performance.now() + 3000;
      };
      canvas.addEventListener('pointermove', onPointer);
      canvas.addEventListener('pointerleave', onLeave);
      window.addEventListener('deviceorientation', onTilt);
      cleanups.push(() => {
        canvas.removeEventListener('pointermove', onPointer);
        canvas.removeEventListener('pointerleave', onLeave);
        window.removeEventListener('deviceorientation', onTilt);
      });

      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      cleanups.push(() => observer.disconnect());
      if (typeof IntersectionObserver === 'function') {
        const io = new IntersectionObserver(([entry]) => {
          visible = !!entry?.isIntersecting;
          if (visible) start();
        });
        io.observe(canvas);
        cleanups.push(() => io.disconnect());
      }
      const onVisibility = () => !document.hidden && start();
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

      const born = performance.now();
      let last = born;
      let clock = 0;
      const draw = (now: number) => {
        frame = 0;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        clock += dt;
        const target = steer && now < steerUntil ? steer : sway(clock);
        view = follow(view, target, dt, steer && now < steerUntil ? 5 : 2);
        const grow = easeIn((now - born) / 1000);
        gl.uniform1f(uZoom, 1 + (PARALLAX_ZOOM - 1) * grow);
        gl.uniform2f(uOffset, view.x * PARALLAX_AMPLITUDE * grow, view.y * PARALLAX_AMPLITUDE * grow);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (visible && !document.hidden && !pausedRef.current) frame = requestAnimationFrame(draw);
      };
      const start = () => {
        if (!frame && !disposed) {
          last = performance.now();
          frame = requestAnimationFrame(draw);
        }
      };
      resize();
      start();
      cleanups.push(() => cancelAnimationFrame(frame));
      // Resume when un-paused.
      const poll = window.setInterval(() => !pausedRef.current && visible && !document.hidden && start(), 500);
      cleanups.push(() => window.clearInterval(poll));
      canvas.addEventListener('webglcontextlost', onFail);
      cleanups.push(() => canvas.removeEventListener('webglcontextlost', onFail));
    })();

    return () => {
      disposed = true;
      for (const c of cleanups) c();
    };
  }, [canvas, url, depthUrl, flatBelow]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * A scene picture that moves in 2.5D when depth is available (made once per picture in the browser), and a
 * flat picture otherwise. Off in Settings, or when the device asks for reduced motion, it is always flat.
 */
export function ParallaxImage({ imageKey, url, alt, className, fit = 'cover', maxHeight = '100%', paused = false, flatBelow = 2 }: Props) {
  const enabled = useSettings((s) => s.settings.image.parallax) && !reducedMotion();
  const depth = useDepthMap(imageKey, enabled);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const live = enabled && !!depth.url && failed !== url;
  useParallax(live ? canvas : null, url, depth.url, paused, flatBelow, () => setFailed(url), setAspect);

  const box: CSSProperties | undefined = fit === 'contain' && aspect ? { aspectRatio: String(aspect), width: `min(100%, calc(${maxHeight} * ${aspect}))`, height: 'auto', marginInline: 'auto' } : undefined;
  if (!live) {
    // No depth (yet, or at all): the flat picture. When depth will never come, a slow drift keeps it alive.
    const drift = enabled && fit === 'cover' && (depth.failed || failed === url);
    return <img key={url} src={url} alt={alt} className={cx(className, drift && styles.drift)} />;
  }
  return <canvas ref={setCanvas} role="img" aria-label={alt} className={cx(className, styles.canvas)} style={box} />;
}
