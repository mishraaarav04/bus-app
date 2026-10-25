import type { AddressInfo } from "node:net";
import { buildServer } from "../src/app.js";
import { DEMO_PASSWORD, seedDemo } from "../src/data/seed.js";

export { DEMO_PASSWORD };

let base = "";
let server: ReturnType<typeof buildServer>["httpServer"];

export async function startTestServer() {
  server = buildServer().httpServer;
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await seedDemo();
}

export async function stopTestServer() {
  await new Promise((r) => server.close(r));
}

export async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; raw?: boolean; headers?: Record<string, string> } = {}
) {
  const res = await fetch(base + path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (opts.raw) return { status: res.status, text: await res.text(), headers: res.headers, json: null as any };
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json, text: "", headers: res.headers };
}

const cache = new Map<string, { token: string; refreshToken: string; user: any; status: number }>();
export async function login(email: string, password = DEMO_PASSWORD, fresh = false) {
  if (!fresh && cache.has(email)) return cache.get(email)!;
  const r = await api("/auth/login", { body: { email, password } });
  const out = { token: r.json?.token as string, refreshToken: r.json?.refreshToken as string, user: r.json?.user, status: r.status };
  if (r.status === 200) cache.set(email, out);
  return out;
}
