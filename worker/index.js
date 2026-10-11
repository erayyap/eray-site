// Static assets serve the site. Only /petville is handled here: it is proxied
// (HTTP and WebSocket) to the PetVille server on Predator via the guess-stt tunnel.
const PETVILLE_ORIGIN = "https://petville-origin.erayy.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
