/** Layout of the name plaque on a card image, in pixels. Pure so it can be tested. */
export function plaqueLayout(width: number, height: number, nameLength: number) {
  const plaqueWidth = Math.round(Math.min(width * 0.86, Math.max(width * 0.56, nameLength * width * 0.045 + width * 0.18)));
  const plaqueHeight = Math.round(height * 0.105);
  return {
    x: Math.round((width - plaqueWidth) / 2),
    y: Math.round(height - plaqueHeight - height * 0.035),
    width: plaqueWidth,
    height: plaqueHeight,
    nameSize: Math.round(Math.min(plaqueHeight * 0.42, (plaqueWidth * 1.55) / Math.max(6, nameLength))),
    subtitleSize: Math.round(plaqueHeight * 0.17),
  };
}

/** Top of the name plaque as a fraction of the card's height (the same for every card size and name). */
export const PLAQUE_TOP = plaqueLayout(1000, 1000, 10).y / 1000;

/**
 * Draws the character's name plaque onto the portrait in the campaign's colours and fonts. The model is
 * never asked to write the name, so the spelling is always right. Returns null where canvas is unavailable.
 */
export async function compositePlaque(image: Blob, name: string, subtitle: string, theme: { accent: string; background: string; font: string }): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  await document.fonts?.ready.catch(() => undefined);
  ctx.drawImage(bitmap, 0, 0);
  const l = plaqueLayout(canvas.width, canvas.height, name.length);
  // A soft shadow and a fade at the bottom so the plaque reads on any image.
  const fade = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = l.height * 0.3;
  ctx.shadowOffsetY = l.height * 0.08;
  const body = ctx.createLinearGradient(0, l.y, 0, l.y + l.height);
  body.addColorStop(0, theme.background);
  body.addColorStop(1, '#050608');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(l.x, l.y, l.width, l.height, l.height * 0.12);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = Math.max(2, l.height * 0.03);
  ctx.beginPath();
  ctx.roundRect(l.x, l.y, l.width, l.height, l.height * 0.12);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.accent;
  ctx.font = `700 ${l.nameSize}px ${theme.font}`;
  ctx.fillText(name, canvas.width / 2, l.y + l.height * 0.43, l.width * 0.9);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#e8e4da';
  ctx.font = `600 ${l.subtitleSize}px Inter, sans-serif`;
  ctx.fillText(subtitle.toUpperCase().split('').join(String.fromCharCode(8202)), canvas.width / 2, l.y + l.height * 0.77, l.width * 0.9);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}
