// Static, client-safe info about each platform: limits and display metadata.

export const PLATFORMS = ["facebook", "instagram", "linkedin", "x", "threads", "youtube", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface PlatformInfo {
  id: Platform;
  name: string;
  color: string;
  charLimit: number;
  /** Which media the platform needs. */
  media: "optional" | "required-image-or-video" | "required-video";
  maxImages: number;
  /** Platform that owns the OAuth connection (Instagram connects through Facebook). */
  connectVia: Platform;
}

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  facebook: { id: "facebook", name: "Facebook", color: "#1877F2", charLimit: 63206, media: "optional", maxImages: 10, connectVia: "facebook" },
  instagram: { id: "instagram", name: "Instagram", color: "#E1306C", charLimit: 2200, media: "required-image-or-video", maxImages: 10, connectVia: "facebook" },
  linkedin: { id: "linkedin", name: "LinkedIn", color: "#0A66C2", charLimit: 3000, media: "optional", maxImages: 1, connectVia: "linkedin" },
  x: { id: "x", name: "X", color: "#111111", charLimit: 280, media: "optional", maxImages: 4, connectVia: "x" },
  threads: { id: "threads", name: "Threads", color: "#333333", charLimit: 500, media: "optional", maxImages: 1, connectVia: "threads" },
  youtube: { id: "youtube", name: "YouTube", color: "#FF0000", charLimit: 5000, media: "required-video", maxImages: 0, connectVia: "youtube" },
  tiktok: { id: "tiktok", name: "TikTok", color: "#00C2B8", charLimit: 2200, media: "required-video", maxImages: 0, connectVia: "tiktok" },
};

/** Platforms that have their own "Connect" button. */
export const CONNECTABLE: Platform[] = ["facebook", "linkedin", "x", "threads", "youtube", "tiktok"];

export function isPlatform(p: string): p is Platform {
  return (PLATFORMS as readonly string[]).includes(p);
}

/** Validate a post for one platform. Returns a list of human-readable problems. */
export function validateForPlatform(
  platform: Platform,
  text: string,
  media: { kind: string }[],
): string[] {
  const info = PLATFORM_INFO[platform];
  const problems: string[] = [];
  const images = media.filter((m) => m.kind === "image").length;
  const videos = media.filter((m) => m.kind === "video").length;
  if (text.length > info.charLimit) problems.push(`${info.name}: text is ${text.length}/${info.charLimit} characters`);
  if (info.media === "required-video" && videos !== 1) problems.push(`${info.name}: needs exactly one video`);
  if (info.media === "required-image-or-video" && media.length === 0) problems.push(`${info.name}: needs an image or video`);
  if (videos > 1) problems.push(`${info.name}: only one video per post`);
  if (videos && images) problems.push(`${info.name}: can't mix images and video in one post`);
  if (images > info.maxImages && info.maxImages > 0) problems.push(`${info.name}: max ${info.maxImages} image(s)`);
  if (platform === "linkedin" && videos) problems.push("LinkedIn: video posting isn't supported yet, use an image or text");
  if (platform === "x" && videos) problems.push("X: video posting isn't supported yet, use images or text");
  if (!text.trim() && media.length === 0) problems.push(`${info.name}: post is empty`);
  return problems;
}
