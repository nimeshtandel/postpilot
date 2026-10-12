import { eq } from "drizzle-orm";
import { db, media } from "@/lib/db";
import { getFile } from "@/lib/media";

// GET /media/:file — public (random file names) so Instagram/Threads/Facebook can fetch media.
// Supports Range requests, which video fetchers use.
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const [row] = await db.select({ mimeType: media.mimeType }).from(media).where(eq(media.fileName, file));
  if (!row) return new Response("Not found", { status: 404 });
  const bytes = await getFile(file);
  if (!bytes) return new Response("Not found", { status: 404 });

  const size = bytes.length;
  const headers: Record<string, string> = {
    "Content-Type": row.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(bytes, { headers: { ...headers, "Content-Length": String(size) } });
}
