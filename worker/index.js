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
      return fetch(new Request(target, request));
    }
    return env.ASSETS.fetch(request);
  },
};
