import { createFileRoute } from "@tanstack/react-router";

const NEON_AUTH_URL = "https://ep-calm-mountain-ayvot686.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth";

async function proxyAuthRequest(request: Request, subpath: string) {
  const url = new URL(request.url);
  const targetUrl = `${NEON_AUTH_URL}/${subpath}${url.search}`;

  const headers = new Headers();
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  // 1. Forward safe headers to prevent fetch failures
  for (const [key, value] of request.headers.entries()) {
    const k = key.toLowerCase();
    if (
      k !== "host" &&
      k !== "origin" &&
      k !== "referer" &&
      k !== "connection" &&
      k !== "content-length" &&
      k !== "transfer-encoding" &&
      k !== "content-encoding" &&
      k !== "cookie"
    ) {
      headers.set(key, value);
    }
  }

  // 2. Map local cookies back to Neon Auth secure naming convention
  const clientCookies = request.headers.get("cookie");
  if (clientCookies) {
    let rewrittenCookies = clientCookies;
    if (isLocalhost) {
      rewrittenCookies = rewrittenCookies.replace(/\bneonauth\./g, "__Secure-neonauth.");
    }
    headers.set("cookie", rewrittenCookies);
  }

  // 3. Force headers to look like a same-origin request to Neon Auth
  const targetHost = "ep-calm-mountain-ayvot686.neonauth.c-5.us-east-2.aws.neon.tech";
  const targetOrigin = `https://${targetHost}`;

  headers.set("Host", targetHost);
  headers.set("Origin", targetOrigin);
  headers.set("Referer", `${targetOrigin}/`);
  headers.set("Sec-Fetch-Site", "same-origin");
  headers.delete("Sec-Fetch-Mode");
  headers.delete("Sec-Fetch-Dest");

  const hasBody = request.body !== null && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const body = hasBody ? await request.clone().arrayBuffer() : undefined;

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual", // Intercept redirects to translate them
  };

  if (body) {
    fetchOptions.body = body;
  }

  const res = await fetch(targetUrl, fetchOptions);

  // 4. Create new headers to mutate response headers
  const responseHeaders = new Headers(res.headers);

  // 5. Rewrite Set-Cookie domain/secure policies
  const setCookieHeader = res.headers.get("set-cookie");
  if (setCookieHeader) {
    const cookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [setCookieHeader];

    responseHeaders.delete("set-cookie");

    for (const cookie of cookies) {
      let newCookie = cookie;
      // Strip Domain so it binds directly to our frontend domain (localhost/Vercel)
      newCookie = newCookie.replace(/Domain=[^;]+;?/gi, "");

      if (isLocalhost) {
        // Strip Secure flag so HTTP localhost accepts it
        newCookie = newCookie.replace(/Secure;?/gi, "");
        // Strip __Secure- prefix which is rejected on non-secure localhost HTTP
        newCookie = newCookie.replace(/__Secure-neonauth\./g, "neonauth.");
      }

      responseHeaders.append("set-cookie", newCookie);
    }
  }

  // 6. Rewrite redirects that point back to the auth server base URL
  if ([301, 302, 307, 308].includes(res.status)) {
    const location = res.headers.get("location");
    if (location && location.startsWith(NEON_AUTH_URL)) {
      const relativePath = location.substring(NEON_AUTH_URL.length);
      responseHeaders.set("location", `${url.origin}/api/auth${relativePath}`);
    }
  }

  const responseBody = [204, 304].includes(res.status) ? null : res.body;

  return new Response(responseBody, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        return proxyAuthRequest(request, params._splat || "");
      },
      POST: async ({ request, params }) => {
        return proxyAuthRequest(request, params._splat || "");
      },
    },
  },
});
