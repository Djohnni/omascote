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

test("first access automatically reconciles the active team without a second onboarding", () => {
  assert.match(live, /const \[profile, eligibility\] = await Promise\.all/);
  assert.match(live, /if \(firstAccess\.profile === null\) return firstAccess/);
  assert.ok(live.indexOf("if (firstAccess.profile === null) return firstAccess") < live.indexOf("await api.listNotifications()"));
  assert.match(live, /Ativando seu time/);
  assert.match(live, /Sem novo cadastro/);
  assert.match(live, /Seu time já participa/);
  assert.match(live, /Ocultar meu time do Radar/);
  assert.match(live, /radar_visible/);
  assert.doesNotMatch(live, /data-form="onboarding"/);
  assert.doesNotMatch(live, /Cadastrar no Radar/);
  assert.doesNotMatch(live, /api\.createRadarProfile/);
  assert.doesNotMatch(live, /api\.importProfilePrint/);
  assert.doesNotMatch(live, /api\.suggestCities/);
  assert.match(live, /api\.getTeamWhatsapp/);
  assert.match(live, /item\.whatsapp_disponivel === true/);
});

test("Instagram is an optional badge and the owner flow never generates a code", () => {
  assert.match(live, /Selo opcional/);
  assert.match(live, /Não verificado/);
  assert.match(live, /Seu time continua visível/);
  assert.match(live, /Busca e convites liberados/);
  assert.match(live, /api\.getVerification\(\)/);
  assert.doesNotMatch(live, /api\.startInstagramVerification/);
  assert.doesNotMatch(live, /api\.confirmInstagramVerification/);
  assert.doesNotMatch(live, /Já coloquei na bio/);
  assert.match(live, /api\.listInstagramVerifications/);
  assert.match(live, /api\.approveInstagramVerification/);
  assert.match(live, /Código observado/);
  assert.match(live, /api\.rejectInstagramVerification/);
  assert.match(live, /if \(error\?\.status !== 403\) throw error/);
  assert.doesNotMatch(live, /verificad[oa] automaticamente/i);
});

test("general search cards show optional-state fallbacks and use the opaque public id", () => {
  assert.match(live, /Filtros são opcionais/);
  assert.match(live, /Horário a combinar/);
  assert.match(live, /Não verificado/);
  assert.match(live, /Sem nota/);
  assert.match(live, /statistics\?\.matches/);
  assert.match(live, /statistics\?\.wins/);
  assert.match(live, /statistics\?\.draws/);
  assert.match(live, /statistics\?\.losses/);
  assert.match(live, /if \(!raw\) return ""/);
  assert.match(live, /new URL\(raw/);
  assert.match(live, /parsed\.origin === resolvedApiBase/);
  assert.match(live, /opponent_public_id: teamPublicId\(state\.selected\)/);
  assert.doesNotMatch(live, /opponent_slug: teamSlug\(state\.selected\)/);
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
