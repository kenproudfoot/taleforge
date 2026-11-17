import { describe, expect, it } from 'vitest';
import { coverScale, deviceTilt, easeIn, follow, pointerTilt, requestTiltPermission, sway } from './parallax';

describe('parallax maths', () => {
  it('sways within the amplitude and does not repeat at the side-to-side period', () => {
    for (let t = 0; t < 60; t += 0.37) {
      const v = sway(t);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(0.45);
    }
    expect(sway(0).y).not.toBeCloseTo(sway(9).y);
  });

  it('maps the pointer to [-1, 1] with the centre at 0', () => {
    expect(pointerTilt(50, 25, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(pointerTilt(0, 50, 100, 50)).toEqual({ x: -1, y: 1 });
    expect(pointerTilt(500, -9, 100, 50)).toEqual({ x: 1, y: -1 });
  });

  it('measures device tilt from the angle it was first held at', () => {
    expect(deviceTilt(0, 50, 50)).toEqual({ x: 0, y: 0 });
    expect(deviceTilt(12.5, 62.5, 50)).toEqual({ x: 0.5, y: 0.5 });
    expect(deviceTilt(-90, 0, 50)).toEqual({ x: -1, y: -1 });
  });

  it('follows a target smoothly and never overshoots', () => {
    let v = { x: 0, y: 0 };
    for (let i = 0; i < 200; i++) v = follow(v, { x: 1, y: -1 }, 1 / 60);
    expect(v.x).toBeCloseTo(1, 3);
    expect(v.y).toBeCloseTo(-1, 3);
    expect(follow({ x: 0, y: 0 }, { x: 1, y: 1 }, 10).x).toBeLessThanOrEqual(1);
    expect(follow({ x: 0.3, y: 0 }, { x: 1, y: 1 }, 0)).toEqual({ x: 0.3, y: 0 });
  });

  it('eases in from flat to moving', () => {
    expect(easeIn(0)).toBe(0);
    expect(easeIn(0.7, 1.4)).toBeCloseTo(0.5);
    expect(easeIn(99)).toBe(1);
  });

  it('crops like object-fit: cover', () => {
    expect(coverScale(16 / 10, 1)).toEqual({ x: 1, y: 10 / 16 });
    expect(coverScale(1, 2)).toEqual({ x: 0.5, y: 1 });
    expect(coverScale(0, 1)).toEqual({ x: 1, y: 1 });
  });

  it('asks for tilt permission only where the browser requires it', async () => {
    const g = globalThis as { DeviceOrientationEvent?: unknown };
    const saved = g.DeviceOrientationEvent;
    g.DeviceOrientationEvent = undefined;
    expect(await requestTiltPermission()).toBe(false);
    g.DeviceOrientationEvent = function () {};
    expect(await requestTiltPermission()).toBe(true);
    g.DeviceOrientationEvent = { requestPermission: async () => 'denied' };
    expect(await requestTiltPermission()).toBe(false);
    g.DeviceOrientationEvent = { requestPermission: async () => 'granted' };
    expect(await requestTiltPermission()).toBe(true);
    g.DeviceOrientationEvent = saved;
  });
});
