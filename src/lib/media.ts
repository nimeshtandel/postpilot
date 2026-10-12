// Media lives in Cloudflare Workers KV (binding "MEDIA") and is served publicly from /media/<random-name>.
// KV is free with no card; each file can be up to 25 MiB.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { appUrl, envOr } from "./env";
import type { MediaItem } from "./social/types";

export const ALLOWED_TYPES: Record<string, "image" | "video"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
};

const KV_MAX_BYTES = 25 * 1024 * 1024;
const store = () => getCloudflareContext().env.MEDIA;

export function maxUploadBytes(): number {
  return Math.min(Number(envOr("MAX_UPLOAD_MB", "25")) * 1024 * 1024, KV_MAX_BYTES);
}

/** Public URL platforms fetch media from. File names are random, so URLs are unguessable. */
export function publicMediaUrl(fileName: string): string {
  return `${appUrl()}/media/${fileName}`;
}

export async function saveFile(fileName: string, data: ArrayBuffer, contentType: string) {
  await store().put(fileName, data, { metadata: { contentType } });
}

export async function deleteFile(fileName: string) {
  await store().delete(fileName);
}

/** The whole file, or null if it's missing. */
export async function getFile(fileName: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const buf = await store().get(fileName, "arrayBuffer");
  return buf ? new Uint8Array(buf) : null;
}

export function toMediaItem(m: { fileName: string; mimeType: string; size: number; kind: string }): MediaItem {
  return {
    kind: m.kind === "video" ? "video" : "image",
    mimeType: m.mimeType,
    size: m.size,
    url: publicMediaUrl(m.fileName),
    key: m.fileName,
  };
}

export async function readMedia(item: MediaItem): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await getFile(item.key);
  if (!bytes) throw new Error(`Media file ${item.key} is missing from storage`);
  return bytes;
}

/** Request body with bytes [start, end) of a file, for uploading to a platform. Files are ≤25 MB. */
export async function mediaBody(item: MediaItem, start = 0, end = item.size): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await readMedia(item);
  return start === 0 && end === bytes.length ? bytes : bytes.slice(start, end);
}
