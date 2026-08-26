"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.html"), "utf8");
const live = fs.readFileSync(path.join(__dirname, "radar-live.js"), "utf8");
const demo = fs.readFileSync(path.join(__dirname, "demo.html"), "utf8");
const preview = fs.readFileSync(path.join(__dirname, "local-preview-server.js"), "utf8");

test("production entry stays hidden until the authenticated eligibility probe succeeds", () => {
  assert.match(app, /meta name="omascote-api-base" content="https:\/\/api\.omascote\.com\.br"/);
  assert.match(app, /meta name="omascote-environment" content="production"/);
  assert.match(app, /data-radar-live-entry[^>]*hidden/);
  assert.match(live, /api\.getEligibility\(\)/);
  assert.match(live, /item\.dataset\.radarAllowed = "true"/);
  assert.doesNotMatch(live, /URLSearchParams|location\.search|[?&]demo=/);
});

test("real mode uses the API as its Radar data source", () => {
  assert.match(live, /demoMode: false/);
  assert.match(live, /api\.listNearbyTeams/);
  assert.match(live, /api\.createInvitation/);
  assert.match(live, /api\.confirmMatchOccurrence/);
  assert.match(live, /api\.submitMatchResult/);
  assert.match(live, /api\.submitMatchEvaluation/);
  assert.match(live, /api\.resolveModerationCase/);
  assert.doesNotMatch(live, /localStorage\.setItem|localStorage\.removeItem/);
});

test("first access renders onboarding before loading notifications", () => {
  assert.match(live, /const \[profile, eligibility\] = await Promise\.all/);
  assert.match(live, /if \(firstAccess\.profile === null\) return firstAccess/);
  assert.ok(live.indexOf("if (firstAccess.profile === null) return firstAccess") < live.indexOf("await api.listNotifications()"));
  assert.match(live, /data-form="onboarding"/);
  for (const field of [
    "city_name", "state_code", "instagram_handle", "modalities",
    "category", "travel_radius_km", "venue_preference", "whatsapp",
    "whatsapp_visible", "accept_terms"
  ]) assert.match(live, new RegExp(`name="${field}"`));
  assert.match(live, /Enviar print do Instagram/);
  assert.match(live, /Preencher manualmente/);
  assert.match(live, /Revise os dados/);
  assert.doesNotMatch(live, /name="city_ibge_code"/);
  assert.doesNotMatch(live, /name="declared_level"/);
  assert.doesNotMatch(live, /name="level"/);
  assert.match(live, /api\.createRadarProfile/);
  assert.match(live, /api\.getTeamWhatsapp/);
  assert.match(live, /item\.whatsapp_disponivel === true/);
  assert.match(live, /requestedWhatsappVisible|whatsapp_visible/);
  assert.match(live, /name="whatsapp_visible"[^>]*disabled/);
  assert.match(live, /consent\.disabled = !valid/);
  assert.match(live, /if \(!valid\) consent\.checked = false/);
  assert.match(live, /validWhatsappInput\(values\.whatsapp\) && values\.whatsapp_visible/);
  assert.match(live, /legacyCrest\(\)/);
  assert.match(live, /legacyFormDefaults\(\)/);
  assert.doesNotMatch(live, /name="city_ibge_code"[^>]*value="4209102"/);
  assert.match(live, /api\.suggestCities/);
  assert.match(live, /captureOnboardingForm/);
  assert.match(live, /state\.onboardingValues/);
  assert.match(live, /Confira a cidade e a UF\./);
  assert.match(live, /radar-live__field--invalid/);
  assert.match(live, /Deixar visível para o time adversário chamar no WhatsApp/);
  assert.doesNotMatch(live, /Enviar print \/ Instagram do time/);
  assert.doesNotMatch(live, /Deixar visível para outros times/);
  assert.doesNotMatch(live, /RADAR_CITY_NOT_SUPPORTED/);
});

test("live Instagram verification requires owner proof and independent review", () => {
  assert.match(live, /Verificar Instagram/);
  assert.match(live, /api\.getVerification\(\)/);
  assert.match(live, /api\.startInstagramVerification/);
  assert.match(live, /verification_id: verification\.verification_id/);
  assert.match(live, /Já coloquei na bio/);
  assert.match(live, /A aprovação é manual/);
  assert.match(live, /api\.listInstagramVerifications/);
  assert.match(live, /api\.approveInstagramVerification/);
  assert.match(live, /Código observado/);
  assert.match(live, /api\.rejectInstagramVerification/);
  assert.match(live, /state\.verificationChallenge = null/);
  assert.match(live, /if \(error\?\.status !== 403\) throw error/);
  assert.doesNotMatch(live, /verificad[oa] automaticamente/i);
});

test("modal supports keyboard containment, escape and focus restoration", () => {
  assert.match(live, /role="dialog" aria-modal="true" aria-labelledby="radarLiveTitle"/);
  assert.match(live, /aria-live="polite"/);
  assert.match(live, /event\.key === "Escape"/);
  assert.match(live, /event\.key === "Tab"/);
  assert.match(live, /returnFocus = item/);
  assert.match(live, /target\?\.focus/);
  assert.match(live, /isolateBackgroundDialogs/);
  assert.match(live, /item\.element\.inert = true/);
});

test("demonstrator and local origin substitution remain explicitly isolated", () => {
  assert.match(demo, /demo=1|Demonstra[cç][aã]o local/i);
  assert.match(demo, /connect-src\s+'none'/i);
  assert.match(preview, /OMASCOTE_LOCAL_API_BASE/);
  assert.match(preview, /local-real/);
  assert.doesNotMatch(app, /127\.0\.0\.1|localhost/);
});
