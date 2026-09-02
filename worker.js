const json = (data, status, origin) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": origin, "vary": "Origin" },
});

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const origin = requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    }});
    if (requestOrigin && requestOrigin !== allowedOrigin) return json({ error: "Origen no autorizado" }, 403, origin);
    if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_SECRET) return json({ error: "Backend sin configurar" }, 503, origin);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/prefixes" && request.method === "GET") {
        const target = new URL(env.APPS_SCRIPT_URL);
        target.searchParams.set("clave", env.APPS_SCRIPT_SECRET);
        target.searchParams.set("accion", "prefijos");
        const result = await fetch(target, { redirect: "follow" }).then((response) => response.json());
        return json(result, result.ok ? 200 : 400, origin);
      }
      if (url.pathname === "/api/prefixes" && request.method === "POST") {
        const body = await request.json();
        const result = await sendToAppsScript(env, { clave: env.APPS_SCRIPT_SECRET, ...body });
        return json(result, result.ok ? 200 : 400, origin);
      }
      if (url.pathname === "/api/movements" && request.method === "POST") {
        const body = await request.json();
        const result = await sendToAppsScript(env, {
          clave: env.APPS_SCRIPT_SECRET,
          accion: "registrar",
          codigo: body.code,
          movimiento: body.movement === "Stock" ? "RECEPCION" : "DEVOLUCION",
        });
        return json(result, result.ok ? 200 : 400, origin);
      }
      return json({ error: "Ruta no encontrada" }, 404, origin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Error de conexión" }, 502, origin);
    }
  },
};

async function sendToAppsScript(env, payload) {
  const response = await fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Apps Script respondió ${response.status}`);
  return response.json();
}
