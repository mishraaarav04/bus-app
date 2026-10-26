// Lists the models your NVIDIA key can see, so you can pick one for AI_MODEL in server/.env.
import "dotenv/config";
const key = process.env.NVIDIA_API_KEY || process.env.AI_API_KEY;
const base = (process.env.AI_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
if (!key) { console.error("No NVIDIA_API_KEY in server/.env"); process.exit(1); }
const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } });
if (!res.ok) { console.error(`The service answered ${res.status}. Check the key.`); process.exit(1); }
const ids = (await res.json()).data.map((m) => m.id).sort();
const chat = ids.filter((id) => !/embed|rerank|guard|safety|clip|parse|reward|retriev|asr|tts|translate|riva|diffusion|image|video|speech|bge/i.test(id));
console.log(`${ids.length} models visible. Likely chat models:\n`);
console.log(chat.join("\n"));
