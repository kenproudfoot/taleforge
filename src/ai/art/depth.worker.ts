/// <reference lib="webworker" />
/**
 * Depth estimation off the main thread: Depth Anything V2 (small) through transformers.js, on WebGPU when the
 * browser has it, otherwise WebAssembly. The model (about 50 MB on WebGPU, 27 MB otherwise) downloads once and
 * the browser caches it. Input: an image Blob. Output: a softened grey PNG, white = near.
 */
import { RawImage, env, pipeline } from '@huggingface/transformers';
import { depthSize, depthToRgba, softenDepth } from './depthMap';

const MODEL = 'onnx-community/depth-anything-v2-small';

env.allowLocalModels = false;

type Estimator = (image: RawImage) => Promise<{ depth: RawImage }>;
let estimator: Promise<Estimator> | null = null;

async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  return !!(await gpu.requestAdapter().catch(() => null));
}

async function load(): Promise<Estimator> {
  if (await hasWebGpu()) {
    try {
      return (await pipeline('depth-estimation', MODEL, { device: 'webgpu', dtype: 'fp16' })) as unknown as Estimator;
    } catch {
      // Some GPUs lack fp16 support; fall through to the CPU build.
    }
  }
  return (await pipeline('depth-estimation', MODEL, { device: 'wasm', dtype: 'q8' })) as unknown as Estimator;
}

self.onmessage = async (e: MessageEvent<{ id: number; image: Blob }>) => {
  const { id, image } = e.data;
  try {
    estimator ??= load();
    const run = await estimator;
    const input = await RawImage.fromBlob(image);
    const { depth } = await run(input);
    const size = depthSize(depth.width, depth.height);
    const small = depth.width === size.width && depth.height === size.height ? depth : await depth.resize(size.width, size.height);
    const grey = small.channels === 1 ? small : small.grayscale();
    const soft = softenDepth(grey.data, size.width, size.height);
    const canvas = new OffscreenCanvas(size.width, size.height);
    canvas.getContext('2d')!.putImageData(new ImageData(depthToRgba(soft), size.width, size.height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ id, blob });
  } catch (err) {
    estimator = null;
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
