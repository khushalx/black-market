import { createRouter } from "@colyseus/core";

export function createMarketRoutes() {
  return createRouter({}, {
    onResponse(response) {
      // Colyseus application codes overlap Cloudflare's 52x gateway statuses.
      // Keep the SDK's JSON code/message, with an ordinary HTTP client error.
      if (response.status >= 520 && response.status <= 529 &&
          response.headers.get("content-type")?.includes("application/json")) {
        return new Response(response.body, {status:400,headers:response.headers});
      }
    },
  });
}
