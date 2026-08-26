"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function loadClient(fetchImpl, traces = []) {
  global.window = {
    fetch: fetchImpl,
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    setTimeout,
    clearTimeout,
    RadarApi: null
  };
  delete require.cache[require.resolve("./radar-api.js")];
  require("./radar-api.js");
  return window.RadarApi.create({
    demoMode: false,
    baseUrl: "https://api.example.invalid",
    getAccessToken: () => "test-token-not-logged",
    fetchImpl,
    onTrace: item => traces.push(item)
  });
}

test("real client sends authentication, idempotency and optimistic version without tracing secrets", async () => {
  let captured;
  const traces = [];
  const client = loadClient(async (url, options) => {
    captured = { url: String(url), options };
    return response(200, { ok: true, profile: { version: 4 } }, { ETag: 'W/"4"', "Cache-Control": "private, no-store" });
  }, traces);
  const result = await client.updateRadarProfile({ city_name: "Joinville" }, 'W/"3"', "idem-local-1");
  assert.equal(captured.url, "https://api.example.invalid/me/time/radar");
  assert.equal(captured.options.headers.get("Authorization"), "Bearer test-token-not-logged");
  assert.equal(captured.options.headers.get("If-Match"), 'W/"3"');
  assert.equal(captured.options.headers.get("Idempotency-Key"), "idem-local-1");
  assert.equal(result.etag, 'W/"4"');
  assert.equal(JSON.stringify(traces).includes("test-token-not-logged"), false);
  assert.equal(JSON.stringify(traces).includes("Joinville"), false);
});

test("first Radar profile uses PATCH with idempotency and no If-Match", async () => {
  let captured;
  const client = loadClient(async (url, options) => {
    captured = { url: String(url), options };
    return response(200, { ok: true, profile: { version: 1 } }, { ETag: 'W/"1"' });
  });
  await client.createRadarProfile({
    city_name: "Joinville",
    state_code: "SC",
    modalities: ["society", "futsal"]
  }, "onboarding-create-0001");
  assert.equal(captured.url, "https://api.example.invalid/me/time/radar");
  assert.equal(captured.options.method, "PATCH");
  assert.equal(captured.options.headers.get("Idempotency-Key"), "onboarding-create-0001");
  assert.equal(captured.options.headers.has("If-Match"), false);
});

test("city suggestions use the protected local API contract without exposing municipal codes", async () => {
  let captured;
  const client = loadClient(async (url, options) => {
    captured = { url: String(url), options };
    return response(200, { ok: true, items: [{ city_name: "Ascurra", state_code: "SC" }] });
  });
  const result = await client.suggestCities("  ascur  ", "sc");
  assert.equal(captured.url, "https://api.example.invalid/me/time/radar/cidades?busca=ascur&uf=SC");
  assert.equal(captured.options.headers.get("Authorization"), "Bearer test-token-not-logged");
  assert.deepEqual(result.data.items, [{ city_name: "Ascurra", state_code: "SC" }]);
  assert.equal(JSON.stringify(result).toLowerCase().includes("ibge"), false);
});

test("smart onboarding uploads only the selected image under the real API contract", async () => {
  let captured;
  const client = loadClient(async (url, options) => {
    captured = { url: String(url), options };
    return response(201, { ok: true, draft: { suggestions: {} }, profile_unchanged: true });
  });
  const file = new Blob(["synthetic"], { type: "image/png" });
  await client.importProfilePrint(file, "smart-print-client-1");
  assert.equal(captured.url, "https://api.example.invalid/me/time/perfil/importar-print");
  assert.equal(captured.options.body instanceof FormData, true);
  assert.equal(captured.options.body.get("imagem").size, file.size);
  assert.equal(captured.options.body.get("imagem").type, file.type);
  assert.equal(captured.options.body.has("print"), false);
  assert.equal(captured.options.headers.get("Idempotency-Key"), "smart-print-client-1");
});

test("WhatsApp is fetched only by the protected click endpoint", async () => {
  let captured;
  const client = loadClient(async (url, options) => {
    captured = { url: String(url), options };
    return response(200, { ok: true, whatsapp_url: "https://wa.me/5547999999999" }, {
      "Cache-Control": "private, no-store"
    });
  });
  const teamId = "22222222-2222-4222-8222-222222222222";
  const result = await client.getTeamWhatsapp(teamId);
  assert.equal(captured.url, `https://api.example.invalid/radar/times/${teamId}/whatsapp`);
  assert.equal(captured.options.headers.get("Authorization"), "Bearer test-token-not-logged");
  assert.equal(result.data.whatsapp_url, "https://wa.me/5547999999999");
});

test("real client preserves pagination and maps session, conflict and API outage safely", async () => {
  const paths = [];
  const client = loadClient(async url => {
    paths.push(String(url));
    if (paths.length === 1) return response(401, { ok: false, code: "SESSION_INVALID" });
    if (paths.length === 2) return response(412, { ok: false, code: "VERSION_CONFLICT" });
    throw new Error("offline");
  });
  await assert.rejects(client.listNotifications("signed_cursor"), error => error.status === 401 && error.code === "SESSION_INVALID");
  await assert.rejects(client.getMatch("11111111-1111-4111-8111-111111111111"), error => error.status === 412 && error.code === "VERSION_CONFLICT");
  await assert.rejects(client.getOwnReputation(), error => error.status === 0 && error.code === "NETWORK_ERROR");
  assert.equal(paths[0].endsWith("/me/notificacoes?cursor=signed_cursor"), true);
});

test("demo remains network-blocked and separate from the real client", async () => {
  global.window = { crypto: { randomUUID: () => "unused" }, setTimeout, clearTimeout, fetch: async () => { throw new Error("must not run"); } };
  delete require.cache[require.resolve("./radar-api.js")];
  require("./radar-api.js");
  const demo = window.RadarApi.create({ demoMode: true });
  await assert.rejects(demo.getEligibility(), error => error.code === "DEMO_NETWORK_BLOCKED");
});
