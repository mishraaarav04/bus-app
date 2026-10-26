// Finds which NVIDIA models your key can actually use right now, and which of them support tool calls.
// NVIDIA's model list also shows retired models, so each one is tested with a tiny request.
import "dotenv/config";
const key = process.env.NVIDIA_API_KEY || process.env.AI_API_KEY;
const base = (process.env.AI_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
if (!key) { console.error("No NVIDIA_API_KEY in server/.env"); process.exit(1); }
const auth = { authorization: `Bearer ${key}`, "content-type": "application/json" };

const list = await fetch(`${base}/models`, { headers: auth });
if (!list.ok) { console.error(`The service answered ${list.status}. Check the key.`); process.exit(1); }
const skip = /embed|rerank|guard|safety|clip|parse|reward|retriev|asr|tts|translate|riva|diffusion|image|video|speech|bge|-vl|vision|vlm|nv-|code|starcoder|sea-lion|jamba|dbrx/i;
const ids = (await list.json()).data.map((m) => m.id).filter((id) => !skip.test(id));
console.log(`Testing ${ids.length} models (this takes a minute)...\n`);

const tool = { type: "function", function: { name: "ping", description: "Returns pong.", parameters: { type: "object", properties: {} } } };
async function post(model, extra = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST", headers: auth, signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: "user", content: "Say hi." }], ...extra }),
    });
    return { ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch { return { ok: false, status: "timeout", ms: Date.now() - t0 }; }
}

const good = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < ids.length) {
    const model = ids[next++];
    const plain = await post(model);
    if (!plain.ok) continue;
    const withTools = await post(model, { tools: [tool] });
    good.push({ model, ms: plain.ms, tools: withTools.ok });
    console.log(`${withTools.ok ? "works + tools" : "works, no tools"}  ${(plain.ms / 1000).toFixed(1)}s  ${model}`);
  }
}));

console.log(good.length ? "" : "\nNo model answered. Check the key at build.nvidia.com, or your connection.");
const best = good.filter((g) => g.tools).sort((a, b) => a.ms - b.ms)[0] ?? good.sort((a, b) => a.ms - b.ms)[0];
if (best) console.log(`\nAdd this line to server/.env, then restart:\nAI_MODEL=${best.model}`);
