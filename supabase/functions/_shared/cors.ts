const FALLBACK_ORIGINS = ["https://soulofuniverse.com"];

const LOOPBACK_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function allowedOrigins(): string[] {
  const raw = Deno.env.get("FRONTEND_ORIGINS") ?? "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return fromEnv.length > 0 ? fromEnv : FALLBACK_ORIGINS;
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowedOrigins();
  const isLoopback = LOOPBACK_PATTERN.test(origin);
  const match = allowed.includes(origin) || isLoopback ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function handleCorsPreflight(
  req: Request,
): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  return null;
}
