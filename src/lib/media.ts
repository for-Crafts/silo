"use client";

import { createClient } from "@/lib/supabase/client";

export const MEDIA_BUCKET = "research-media";
/** エディタ JSON に保存する画像 src の接頭辞。実体は private バケットのパス。 */
export const MEDIA_SCHEME = "silo-media:";

const SIGN_TTL = 60 * 60; // 1h
const cache = new Map<string, { url: string; exp: number }>();
let queue: Array<{ path: string; resolve: (url: string | null) => void }> = [];
let scheduled = false;

/** 同じ描画フレームで要求された画像の署名 URL を 1 リクエストにまとめて取得する。 */
export function resolveMediaUrl(src: string): Promise<string | null> {
  if (!src.startsWith(MEDIA_SCHEME)) return Promise.resolve(src);
  const path = src.slice(MEDIA_SCHEME.length);
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    queue.push({ path, resolve });
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 0);
    }
  });
}

async function flush() {
  scheduled = false;
  const batch = queue;
  queue = [];
  const paths = [...new Set(batch.map((b) => b.path))];
  const { data, error } = await createClient().storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGN_TTL);
  const exp = Date.now() + SIGN_TTL * 1000;
  const byPath = new Map<string, string>();
  if (!error && data) {
    for (const d of data) {
      if (d.path && d.signedUrl) {
        byPath.set(d.path, d.signedUrl);
        cache.set(d.path, { url: d.signedUrl, exp });
      }
    }
  }
  batch.forEach((b) => b.resolve(byPath.get(b.path) ?? null));
}

/** 長辺 1600px の WebP に縮小する。数 MB の写真でも数百 KB になり、アップロードが速くなる。 */
export async function shrinkImage(file: File, maxSide = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.type === "image/gif") {
    const bmp = await createImageBitmap(file);
    return { blob: file, width: bmp.width, height: bmp.height }; // アニメーションを保つため GIF はそのまま
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/webp", 0.85)
  );
  return { blob, width, height };
}

/** 縮小してアップロードし、エディタに保存する src（silo-media:パス）を返す。 */
export async function uploadImage(
  file: File,
  target: { workspaceId: string; researchId: string }
): Promise<{ src: string; width: number; height: number }> {
  const { blob, width, height } = await shrinkImage(file);
  const ext = blob.type === "image/gif" ? "gif" : "webp";
  const path = `${target.workspaceId}/${target.researchId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient()
    .storage.from(MEDIA_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  // アップロード直後の表示用に、手元の blob URL を署名 URL の代わりにキャッシュしておく
  cache.set(path, { url: URL.createObjectURL(blob), exp: Date.now() + SIGN_TTL * 1000 });
  return { src: MEDIA_SCHEME + path, width, height };
}
