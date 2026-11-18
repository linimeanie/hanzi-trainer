// Supabase Edge Function "read-notes": reads photos/screenshots of Chinese class notes with Claude
// and returns the new words (+ example sentences) for the trainer app.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  — your Claude API key
//   ALLOWED_EMAILS     — comma-separated emails allowed to use it (so nobody else spends your key)
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SCHEMA = {
  type: "object",
  properties: {
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date written for this class as YYYY-MM-DD, or empty string" },
          words: {
            type: "array",
            items: {
              type: "object",
              properties: {
                hz: { type: "string", description: "The word in simplified Chinese characters" },
                py: { type: "string", description: "Pinyin with tone marks, syllables of one word joined (e.g. tuìfáng)" },
                ru: { type: "string", description: "Short Russian meaning" },
                en: { type: "string", description: "Short English meaning" },
                mw: { type: "string", description: "For a countable noun: its usual measure word (e.g. 份 for 简历); otherwise empty string" },
                mw_py: { type: "string", description: "Pinyin of the measure word with tone mark, or empty string" },
                memo: { type: "string", description: "One vivid Russian memory image for how the characters look (parts, pictures), max 25 words" },
                examples: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { zh: { type: "string" }, py: { type: "string" }, ru: { type: "string" } },
                    required: ["zh", "py", "ru"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["hz", "py", "ru", "en", "mw", "mw_py", "memo", "examples"],
              additionalProperties: false,
            },
          },
        },
        required: ["date", "words"],
        additionalProperties: false,
      },
    },
    note: { type: "string", description: "Anything unclear on the page, in Russian, or empty string" },
  },
  required: ["lessons", "note"],
  additionalProperties: false,
};

const PROMPT = `These are photos or screenshots of my Chinese class notes (handwritten notebook or iPad).
Extract the vocabulary I studied so I can add it to my flashcard trainer.

- Each paragraph / block separated by an empty line or a new date is one class (lesson). Keep the order of the page.
- Characters are often written several times for practice: list each word once.
- Prefer my own translation from the notes (Russian or English); otherwise give a short one. Russian is the main language.
- Pinyin: full tone marks. My notes may show only tone arrows — use them to check the reading.
- For each word add "memo": a short, vivid Russian memory image based on how the characters look — which parts they are built from and what picture that makes (e.g. 休 = человек 亻 прислонился к дереву 木 — отдыхает).
- Phrases I wrote as a whole (e.g. 大姨妈来了) can be one entry.
- For each word write 3 short, natural example sentences (simplified Chinese, pinyin with tone marks, Russian), using simple everyday vocabulary — prefer words from these notes and from the "already known" list.
- Skip words in the "already known" list unless the notes clearly give them a new meaning.
- If something is hard to read, give your best reading and mention it in "note".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // who is calling — only allowed accounts may spend the API key
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await sb.auth.getUser();
  const allowed = (Deno.env.get("ALLOWED_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !allowed.includes(user.email.toLowerCase())) return json({ error: "not allowed" }, 403);

  let body: { images?: { media_type: string; data: string }[]; known?: string[]; hint?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const images = (body.images ?? []).slice(0, 6);
  if (!images.length) return json({ error: "no images" }, 400);

  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((im) => ({
    type: "image",
    source: { type: "base64", media_type: im.media_type as "image/jpeg", data: im.data },
  }));
  content.push({
    type: "text",
    text: `${PROMPT}\n\nAlready known words: ${(body.known ?? []).slice(0, 2500).join(" ")}` +
      (body.hint ? `\n\nMy note about these pages: ${body.hint}` : ""),
  });

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
  try {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return json({ error: "Claude declined to read these images" }, 422);
    if (msg.stop_reason === "max_tokens") return json({ error: "too many words at once — try fewer pages" }, 422);
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return json(JSON.parse(text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate limited, try again in a minute" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "API key is not valid" }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `Claude API error ${e.status}` }, 502);
    if (e instanceof SyntaxError) return json({ error: "could not parse the answer" }, 502);
    return json({ error: String(e) }, 500);
  }
});
