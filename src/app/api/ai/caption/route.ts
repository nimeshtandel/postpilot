import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { envOr, readVar } from "@/lib/env";
import { PLATFORM_INFO, PLATFORMS } from "@/lib/platforms";

const Body = z.object({
  /** "write" = draft from an idea; "adapt" = tailor existing text to each platform; "improve" = polish. */
  mode: z.enum(["write", "adapt", "improve"]),
  input: z.string().trim().min(1).max(5000),
  tone: z.string().max(60).optional(),
  language: z.string().max(40).optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
});

const TASK = {
  write: "Write a social media post from this idea.",
  adapt: "Rewrite this post so it fits each platform's style and limits. Keep the core message.",
  improve: "Improve this post: make it clearer, more engaging and more scroll-stopping. Keep the meaning.",
};

// POST /api/ai/caption → { captions: { [platform]: string }, hashtags: string[] }
export async function POST(req: Request) {
  const userId = await apiUser();
  if (userId instanceof Response) return userId;
  const apiKey = readVar("ANTHROPIC_API_KEY");
  if (!apiKey) return Response.json({ error: "Add the ANTHROPIC_API_KEY secret to use AI captions" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const { mode, input, tone, language, platforms } = parsed.data;

  const specs = platforms
    .map((p) => `- ${p}: max ${PLATFORM_INFO[p].charLimit} characters`)
    .join("\n");

  const prompt = `You are a social media copywriter for a solo creator.
${TASK[mode]}

Tone: ${tone || "friendly and authentic"}
Language: ${language || "same as the input"}

Platforms and hard limits:
${specs}

Platform style guide: X and Threads are short and punchy; LinkedIn is professional with line breaks and a hook in the first line; Instagram and TikTok are casual with emojis and hashtags at the end; Facebook is conversational; YouTube is a video description with the key point first.

Input:
"""
${input}
"""

Reply with ONLY a JSON object, no markdown fences, shaped like:
{"captions": {${platforms.map((p) => `"${p}": "..."`).join(", ")}}, "hashtags": ["#tag1", "#tag2"]}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: envOr("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    // Enforce hard limits in case the model overshoots.
    const captions: Record<string, string> = {};
    for (const p of platforms) {
      const c = String(json.captions?.[p] ?? "");
      captions[p] = c.length > PLATFORM_INFO[p].charLimit ? c.slice(0, PLATFORM_INFO[p].charLimit - 1) + "…" : c;
    }
    return Response.json({ captions, hashtags: Array.isArray(json.hashtags) ? json.hashtags.slice(0, 15) : [] });
  } catch (e) {
    console.error("[ai]", e);
    return Response.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
}
