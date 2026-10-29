// Static assets serve the site. The Worker handles only:
//   /petville      proxied (HTTP and WebSocket) to the PetVille server on Predator via the guess-stt tunnel
//   /api/contact   the "let's build together" form on /balbal: POST JSON -> saved in KV (CONTACT_SUBMISSIONS, key contact/<time>-<id>)
//                  first, then e-mailed to CONTACT_TO through Email Routing (send_email binding CONTACT_MAIL) when configured;
//                  a failed e-mail still counts as received (the record says mailed: false)
import { EmailMessage } from "cloudflare:email";

const PETVILLE_ORIGIN = "https://petville-origin.erayy.com";
const CONTACT_FROM = "form@erayy.com";
const LIMITS = { who: 120, email: 200, message: 8000 };

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// RFC 2047 header word / base64 body: names and messages are Turkish, so everything is UTF-8
const b64 = (s) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};
const header = (s) => `=?UTF-8?B?${b64(s)}?=`;
const wrap = (s) => s.replace(/.{1,76}/g, "$&\r\n");

async function contact(request, env) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const origin = request.headers.get("Origin");
  if (origin && !/^https:\/\/(www\.)?erayy\.com$|^https:\/\/eray-site\.[a-z0-9-]+\.workers\.dev$/.test(origin)) return json(403, { error: "origin" });
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (env.CONTACT_LIMIT) {
    const { success } = await env.CONTACT_LIMIT.limit({ key: ip });
    if (!success) return json(429, { error: "Too many messages, try again in a minute." });
  }
  let data;
  try { data = await request.json(); } catch { return json(400, { error: "bad request" }); }
  if (data.website) return json(200, { ok: true });   // honeypot: bots fill the hidden field, people never see it
  const who = String(data.who || "").trim(), email = String(data.email || "").trim(), message = String(data.message || "").trim();
  if (!who || !message) return json(400, { error: "name and message are required" });
  if (who.length > LIMITS.who || email.length > LIMITS.email || message.length > LIMITS.message) return json(400, { error: "too long" });
  const replyTo = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/.test(email) ? email : "";
  const clean = (s) => s.replace(/[\r\n]+/g, " ");

  const id = `${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`;
  const record = { id, who, email, message, page: String(data.page || "").slice(0, 200), lang: String(data.lang || "").slice(0, 8),
                   ip, country: request.cf?.country || null, userAgent: (request.headers.get("User-Agent") || "").slice(0, 300), mailed: false };
  try {
    await env.CONTACT_SUBMISSIONS.put(`contact/${id}`, JSON.stringify(record));
  } catch (error) {
    console.error("contact store failed", error);
    return json(502, { error: "could not save" });
  }
  if (!env.CONTACT_MAIL || !env.CONTACT_TO) return json(200, { ok: true });

  const body = `${message}\n\n-- \n${who}${email ? ` <${email}>` : ""}\nPage: ${clean(String(data.page || "").slice(0, 200))}\n` +
    `Language: ${clean(String(data.lang || "").slice(0, 8))}  IP: ${ip}  Country: ${request.cf?.country || "?"}\n`;
  const raw = [
    `From: ${header("erayy.com form")} <${CONTACT_FROM}>`,
    `To: <${env.CONTACT_TO}>`,
    ...(replyTo ? [`Reply-To: ${header(clean(who))} <${replyTo}>`] : []),
    `Subject: ${header("Birlikte yapalım: " + clean(who))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@erayy.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(body)),
  ].join("\r\n");
  try {
    await env.CONTACT_MAIL.send(new EmailMessage(CONTACT_FROM, env.CONTACT_TO, raw));
    await env.CONTACT_SUBMISSIONS.put(`contact/${id}`, JSON.stringify({ ...record, mailed: true }));
  } catch (error) {
    console.error("contact e-mail failed (saved in KV)", id, error);
  }
  return json(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") return contact(request, env);
    if (url.pathname === "/petville") {
      return Response.redirect(`${url.origin}/petville/${url.search}`, 301);
    }
    if (url.pathname.startsWith("/petville/")) {
      const target = PETVILLE_ORIGIN + url.pathname + url.search;
      const res = await fetch(new Request(target, request));
      if (res.status === 101 || res.webSocket) return res;
      // the zone's browser-cache TTL rewrites the origin's no-cache to max-age=14400, which kept players on stale game
      // scripts for hours after a deploy; revalidate every load instead (unchanged files come back as cheap 304s)
      const out = new Response(res.body, res);
      out.headers.set("Cache-Control", url.pathname.startsWith("/petville/api") ? "no-store" : "no-cache");
      return out;
    }
    return env.ASSETS.fetch(request);
  },
};
