import { createFileRoute } from "@tanstack/react-router";

const NEON_AUTH_URL = "https://ep-calm-mountain-ayvot686.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth";

async function proxyAuthRequest(request: Request, subpath: string) {
  const url = new URL(request.url);
  const targetUrl = `${NEON_AUTH_URL}/${subpath}${url.search}`;

  const headers = new Headers(request.headers);
  const targetHost = "ep-calm-mountain-ayvot686.neonauth.c-5.us-east-2.aws.neon.tech";
  const targetOrigin = `https://${targetHost}`;

  // Override headers to present the request as same-origin to the Neon Auth server,
  // bypassing CSRF/origin rejections.
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
    redirect: "manual", // Prevent server-side redirect follow, pass 302/307 back to browser
  };

  if (body) {
    fetchOptions.body = body;
  }

  const res = await fetch(targetUrl, fetchOptions);
  return res;
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
