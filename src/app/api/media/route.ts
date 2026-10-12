import { db, media } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { randomHex } from "@/lib/crypto";
import { ALLOWED_TYPES, maxUploadBytes, publicMediaUrl, saveFile } from "@/lib/media";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mov",
};

// POST /api/media (multipart, field "file") → { id, url, kind }
export async function POST(req: Request) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  const kind = ALLOWED_TYPES[file.type];
  if (!kind) return Response.json({ error: "Use JPG, PNG, WEBP, GIF, MP4 or MOV" }, { status: 400 });
  if (file.size > maxUploadBytes())
    return Response.json({ error: `File is too large (max ${Math.round(maxUploadBytes() / 1048576)} MB)` }, { status: 413 });

  const fileName = `${randomHex(16)}.${EXT[file.type]}`;
  await saveFile(fileName, await file.arrayBuffer(), file.type);
  const [row] = await db
    .insert(media)
    .values({ userId, fileName, mimeType: file.type, size: file.size, kind })
    .returning({ id: media.id });
  return Response.json({ id: row.id, url: publicMediaUrl(fileName), kind, mimeType: file.type });
}
