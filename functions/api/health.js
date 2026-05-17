export async function onRequestGet() {
  return new Response(JSON.stringify({
    ok: true,
    message: "Cloudflare Pages Functions funcionando",
    endpoints: ["/api/import-backup"]
  }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
