/**
 * Getting a photo out of a Zalo message and onto disk, so vision can look at it.
 *
 * Two things here are load-bearing and were learned the hard way:
 *   - VISION_DIR is an ISOLATED directory. Vision runs `claude` with the Read tool
 *     scoped to it, because a user-written caption is untrusted input that ends up
 *     inside a prompt. Confine the filesystem tool by path; do not just strip characters.
 *   - a "photo" must be proven, not assumed. Zalo video/file messages also carry a
 *     thumbUrl on the same CDN, so downloading whatever URL appears would pull whole
 *     video bodies. Type, extension, Content-Type and a size cap all get a vote.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

export const VISION_DIR = '/tmp/zalo-vision';

const hasImageExt = (u) => /\.(jpe?g|png|webp|gif)(?:[?&#]|$)/i.test(u);

/** Collect candidate image URLs from a Zalo attachment/quote object, best quality first. */
function imageUrlsFrom(obj) {
  const acc = [];
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 3) return;
    for (const k of ['hdUrl', 'oriUrl', 'href', 'normalUrl', 'thumbUrl', 'thumb']) {
      const v = o[k];
      if (typeof v === 'string' && /^https?:\/\//.test(v)) acc.push(v);
    }
    if (typeof o.params === 'string') { try { walk(JSON.parse(o.params), depth + 1); } catch { /* ignore */ } }
  };
  walk(obj, 0);
  return [...new Set(acc)];
}

/** Return { imageUrls } if the message IS a photo or REPLIES to one, else null (skips video/file/sticker). */
export function extractImage(msg) {
  const content = msg.data?.content;
  const type = String(msg.data?.msgType || (content && content.type) || '').toLowerCase();
  const isPhotoType = /photo|image|pic/.test(type);
  const isOtherMedia = /video|voice|audio|file|sticker|gif|doc|share|link|contact|location|gift/.test(type);
  if (content && typeof content === 'object' && !isOtherMedia) {
    const urls = imageUrlsFrom(content);
    // Accept when Zalo tags it a photo, or (type unknown) a URL has a real image extension.
    if (urls.length && (isPhotoType || (!type && urls.some(hasImageExt)))) return { imageUrls: urls };
  }
  // Reply to a photo → image lives in quote.attach (no msgType there → require an image extension).
  const attach = msg.data?.quote?.attach;
  if (attach) {
    let a = attach;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
    const urls = imageUrlsFrom(a);
    if (urls.length && urls.some(hasImageExt)) return { imageUrls: urls };
  }
  return null;
}

/**
 * Download the first URL that is actually an image into VISION_DIR; null on failure.
 * Guards: per-URL timeout, Content-Type must be image/*, size cap — so a video/file
 * href (which shares a message with an image thumb) is skipped, not fetched whole.
 */
export async function downloadImage(urls) {
  mkdirSync(VISION_DIR, { recursive: true });
  const MAX = 15 * 1024 * 1024;
  const ordered = [...urls].sort((a, b) => Number(hasImageExt(b)) - Number(hasImageExt(a)));
  for (const u of ordered) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(u, { signal: ctrl.signal });
      if (!res.ok) continue;
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      if (ct && !ct.startsWith('image/')) continue; // skip video/file bodies
      if (Number(res.headers.get('content-length') || 0) > MAX) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX) continue;
      const ext = (ct.match(/image\/(jpe?g|png|webp|gif)/)?.[1] || u.match(/\.(jpe?g|png|webp|gif)/i)?.[1] || 'jpg')
        .toLowerCase().replace('jpeg', 'jpg');
      const dest = `${VISION_DIR}/zalo-img-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
      writeFileSync(dest, buf);
      return dest;
    } catch {
      /* try next URL */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
