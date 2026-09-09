const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("app.html", "utf8");
const atendimentoHtml = fs.readFileSync("atendimento/index.html", "utf8");
const atendimentoJsName = atendimentoHtml.match(/assets\/(index-[^"']+\.js)/)?.[1];
assert.ok(atendimentoJsName, "bundle do atendimento não encontrado");
const atendimentoBundle = fs.readFileSync(`atendimento/assets/${atendimentoJsName}`, "utf8");
assert.doesNotMatch(atendimentoBundle, /Revisar informações|Confira o resumo/, "a revisão não deve aparecer antes do envio");
assert.doesNotMatch(atendimentoBundle, /imagem\(ns\) salva\(s\)/, "o envio de arquivos não deve lotar a conversa");
assert.match(atendimentoBundle, /Pedido enviado\./, "o sucesso precisa ser curto");
assert.match(atendimentoBundle, /omascote-chat:open-orders/, "o botão verde precisa abrir os pedidos reais");
assert.match(atendimentoBundle, /jogo\(s\) encontrado\(s\)/, "o chat precisa mostrar todos os jogos identificados");
assert.match(atendimentoBundle, /Envie os escudos/, "o chat precisa pedir os escudos depois da leitura");
assert.match(atendimentoBundle, /omascote-chat:create-order-batch/, "o chat precisa enviar os jogos escolhidos em lote");
assert.match(html, /class="homeChatStage" id="integratedChatModal"/, "o chat precisa aparecer entre os menus da página inicial");
assert.match(html, /id="productsMenuToggle"[^>]+aria-expanded="false"/, "os produtos precisam começar recolhidos");
assert.match(html, /id="productsMenuPanel" hidden/, "a área antiga de produtos precisa iniciar fechada");
assert.match(html, /event\.target\.matches\("\.composer textarea"\)/, "o campo principal do chat precisa ativar a ampliação");
assert.match(html, /classList\.toggle\("is-expanded"/, "o chat precisa ampliar sem trocar de página");
const start = html.indexOf("const omascoteChatOrderInFlight");
const end = html.indexOf("const MEU_CLUBE_PLAY_STORE_URL", start);
assert.ok(start >= 0 && end > start, "bloco da integração não encontrado");

class TestFile {
  constructor(chunks, name, options = {}) {
    this.name = name;
    this.type = options.type || "";
    this.size = chunks.reduce((total, chunk) => total + (chunk.byteLength || chunk.length || 0), 0);
  }
}

const productIds = [
  "proximo_jogo", "resultado", "jogador_escudo", "contratacao", "escalacao",
  "patrocinador", "escudo3d", "mascote_uniforme", "proximo_jogo_jogador",
  "resultado_jogo_jogador"
];
const products = Object.fromEntries(productIds.map(id => [id, { id }]));
const scenarios = [{ id:"cenario_atual_v1", label:"Cenário atual" }, { id:"amostra_2_v1", label:"Amostra 2" }];
const listeners = new Map();
let accountOpened = 0;
let ordersOpened = 0;
const windowStub = {
  location:{ hostname:"localhost", origin:"http://localhost:4173" },
  addEventListener(type, listener){ listeners.set(type, listener); }
};
const integratedChatFrame = { contentWindow:{} };
const session = new Map();
const sessionStorage = { getItem:key => session.get(key) || null, setItem:(key, value) => session.set(key, String(value)) };
const splitCleanMatchupText = value => {
  const parts = String(value || "").split(/\s+(?:x|vs\.?|versus)\s+/i).map(item => item.trim()).filter(Boolean);
  return { home:parts[0] || "", away:parts.slice(1).join(" x ") };
};

const submitted = [];
const legacyBuildCalls = [];
global.token = "token-de-teste";
global.getCleanProductSchema = () => ({ endpoint:"/pedidos" });
global.buildEscudo3dLegacyFormData = () => ({ append(){} });
global.buildLegacyFormDataFromClean = (productKey, order, options) => {
  legacyBuildCalls.push({ productKey, order, options });
  return { productKey, order, entries:[], append(key, value){ this.entries.push([key, value]); } };
};
global.appendOrderClientRequest = (form, value) => form.append("client_request_id", value);
global.API_BASE = "https://api.omascote.test";
global.buildOrderCreationHeaders = value => ({ Authorization:"Bearer token-de-teste", "X-Idempotency-Key":value });
global.fetch = async (url, options) => {
  submitted.push({ url, options });
  return { ok:true, status:200, async json(){ return { ok:true, pedido_id:"pedido-chat-1", pagamento_pendente:false }; } };
};
global.ia4LerJsonSeguro = response => response.json();
global.ia4TratarAuthInvalida = () => "";
global.salvarPedidoAtivoLocal = () => {};
global.ia4Track = () => {};
global.fotoJogosGerarPixAntesDaCriacao = async items => items;
global.fotoJogosAbrirPrimeiroPixGerado = () => {};
global.atualizarTopoProducao = () => {};
global.mostrarAvisoPedido = () => {};
global.refreshMe = async () => ({ ok:true });
global.carregarHistorico = async () => ({ ok:true });
global.destacarMeusPedidos = () => {};

const factory = new Function(
  "window", "integratedChatFrame", "PRODUCTS",
  "getProductPublicScenarios", "getProductDefaultScenarioId", "splitCleanMatchupText",
  "CLEAN_PRODUCT_SCHEMA_VERSION", "File", "sessionStorage", "omascoteChatLocalPreview", "criarClientRequestId",
  "abrirMinhaContaPeloAtendimento", "abrirPedidosPeloAtendimento",
  `${html.slice(start, end)}\nreturn {omascoteChatAllowedOrigin,omascoteChatSportContext,omascoteChatBuildCleanOrders,omascoteChatClientRequestId,omascoteChatSubmitOrders,omascoteChatSubmitOrderBatch};`
);
const bridge = factory(
  windowStub,
  integratedChatFrame,
  products,
  () => scenarios,
  () => "cenario_atual_v1",
  splitCleanMatchupText,
  2,
  TestFile,
  sessionStorage,
  () => true,
  prefix => `${prefix}_00000000-0000-4000-8000-000000000000`,
  () => { accountOpened += 1; },
  () => { ordersOpened += 1; }
);

class TestFormData {
  constructor(){ this.values = new Map(); }
  append(key, value){ if(!this.values.has(key)) this.values.set(key, value); }
  set(key, value){ this.values.set(key, value); }
  has(key){ return this.values.has(key); }
  get(key){ return this.values.get(key); }
}
const legacyStart = html.indexOf("function buildLegacyFormDataFromClean");
const legacyEnd = html.indexOf("function buildEscudo3dLegacyFormData", legacyStart);
assert.ok(legacyStart >= 0 && legacyEnd > legacyStart, "serializador oficial não encontrado");
const legacyFactory = new Function(
  "PRODUCTS", "getCleanProductSchema", "FormData", "appendCleanTextLegacy", "appendCleanAssetLegacy", "appendIa4AccessContext", "splitCleanMatchupText",
  `${html.slice(legacyStart, legacyEnd)}\nreturn buildLegacyFormDataFromClean;`
);
const buildOfficialFormData = legacyFactory(
  products,
  () => ({ fields:[], legacyDefaults:{} }),
  TestFormData,
  (form, key, value) => form.append(key, String(value || "")),
  () => {},
  () => {},
  splitCleanMatchupText
);

const crestSerializerStart = html.indexOf("function buildEscudo3dLegacyFormData");
const crestSerializerEnd = html.indexOf("function setCleanProductMsg", crestSerializerStart);
assert.ok(crestSerializerStart >= 0 && crestSerializerEnd > crestSerializerStart, "serializador do Escudo 3D não encontrado");
const crestSerializerFactory = new Function(
  "FormData", "CLEAN_PRODUCT_SCHEMA_VERSION", "omascoteChatSportContext", "appendIa4AccessContext",
  `${html.slice(crestSerializerStart, crestSerializerEnd)}\nreturn buildEscudo3dLegacyFormData;`
);
const buildOfficialCrestFormData = crestSerializerFactory(TestFormData, 2, bridge.omascoteChatSportContext, () => {});

const bytes = () => new Uint8Array([1, 2, 3]).buffer;
const file = field => ({ field, name:`${field}.png`, type:"image/png", bytes:bytes() });
const draft = (flow, values) => ({ id:`rascunho-${flow}`, flow, values:{ sport:"Futebol", ...values } });

assert.equal(bridge.omascoteChatAllowedOrigin("http://localhost:4173"), true);
assert.equal(bridge.omascoteChatAllowedOrigin("https://exemplo.com"), false);
assert.equal(bridge.omascoteChatAllowedOrigin("http://localhost:3000"), false);

const next = bridge.omascoteChatBuildCleanOrders(
  draft("proximo_jogo", { matchup:"Meu Time x Rival", match_datetime:"domingo 16h", competition:"Copa", scenario_id:"Cenário atual" }),
  [file("home_crest"), file("away_crest")]
)[0].order;
assert.deepEqual(next.fields.matchup, { home_team:"Meu Time", away_team:"Rival" });
assert.equal(next.fields.scenario_id, "cenario_atual_v1");
assert.equal(next.assets.home_crest.files.length, 1);
assert.equal(next.fields.sport, "Futebol");

const individualNext = bridge.omascoteChatBuildCleanOrders(
  draft("proximo_jogo", { sport:"Jiu-jítsu", matchup:"Carlos no Open Estadual", match_datetime:"domingo 16h", competition:"Open Estadual" }),
  []
)[0].order;
assert.deepEqual(individualNext.fields.matchup, { text:"Carlos no Open Estadual" });
assert.equal(individualNext.fields.sport, "Jiu-jítsu");
const individualNextLegacy = buildOfficialFormData("proximo_jogo", individualNext);
assert.equal(individualNextLegacy.get("rodada"), "Carlos no Open Estadual");
assert.equal(individualNextLegacy.get("time_adversario"), "");

const nextWithoutImages = bridge.omascoteChatBuildCleanOrders(
  draft("proximo_jogo", { matchup:"Meu Time x Rival", match_datetime:"domingo 16h", competition:"Copa", photo_mode:"Sem foto" }),
  []
)[0].order;
assert.equal(nextWithoutImages.assets.home_crest.files.length, 0);
assert.equal(nextWithoutImages.assets.away_crest.files.length, 0);
assert.equal(nextWithoutImages.assets.match_photo.files.length, 0);

const result = bridge.omascoteChatBuildCleanOrders(
  draft("resultado", { score:"Meu Time 3 x 2 Rival", competition:"Copa" }),
  [file("home_crest")]
)[0].order;
assert.deepEqual(result.fields.score, { home_team:"Meu Time", home_score:"3", away_score:"2", away_team:"Rival" });

for(const [sport, score] of [["Jiu-jítsu", "Carlos venceu por finalização"], ["Vôlei", "Aurora venceu por 3 sets a 1"]]){
  const writtenResult = bridge.omascoteChatBuildCleanOrders(
    draft("resultado", { sport, score, competition:"Estadual" }),
    []
  )[0].order;
  assert.deepEqual(writtenResult.fields.score, { text:score });
  const writtenResultLegacy = buildOfficialFormData("resultado", writtenResult);
  assert.equal(writtenResultLegacy.get("rodada"), score);
  assert.equal(writtenResultLegacy.get("gols_adversario"), "");
}

const lineup = bridge.omascoteChatBuildCleanOrders(
  draft("escalacao", { matchup:"Meu Time x Rival", players:"Ana | Goleira\nBia | Ala" }),
  []
)[0].order;
assert.deepEqual(lineup.fields.players, [{ nome:"Ana", posicao:"Goleira" }, { nome:"Bia", posicao:"Ala" }]);

const sponsor = bridge.omascoteChatBuildCleanOrders(
  draft("patrocinador", { title:"Nossos parceiros" }),
  [file("team_crest"), file("sponsor_logos"), file("sponsor_logos")]
)[0].order;
assert.equal(sponsor.assets.sponsor_logos.files.length, 2);

const mascot = bridge.omascoteChatBuildCleanOrders(
  draft("mascote_uniforme", { mascot_animal:"Leão" }),
  [file("team_crest")]
)[0].order;
assert.equal(mascot.fields.mascot_animal, "Leão");

const crest3d = bridge.omascoteChatBuildCleanOrders(
  draft("escudo3d", { sport:"Natação" }),
  [file("team_crest")]
)[0];
assert.equal(crest3d.special, "escudo3d");
assert.equal(crest3d.values.sport, "Natação");
const crest3dForm = buildOfficialCrestFormData(new TestFile([new Uint8Array([1])], "logo.png", {type:"image/png"}), "", crest3d.values);
assert.equal(JSON.parse(crest3dForm.get("fields_json")).sport, "Natação");
assert.equal(JSON.parse(crest3dForm.get("assets_json")).team_crest.files[0], "logo.png");

const athleteNext = bridge.omascoteChatBuildCleanOrders(
  draft("proximo_jogo_jogador", { matchup:"Meu Time x Rival", match_datetime:"domingo 16h", competition:"Copa" }),
  [file("home_crest"), file("away_crest"), file("athlete_photos")]
)[0].order;
assert.equal(athleteNext.assets.player_photo.files.length, 1);

const individualAthleteNext = bridge.omascoteChatBuildCleanOrders(
  draft("proximo_jogo_jogador", { sport:"Corrida", matchup:"Ana na Corrida da Cidade", match_datetime:"domingo 7h", competition:"10 km" }),
  [file("athlete_photos")]
)[0].order;
assert.deepEqual(individualAthleteNext.fields.matchup, { text:"Ana na Corrida da Cidade" });

const athleteResult = bridge.omascoteChatBuildCleanOrders(
  draft("resultado_jogo_jogador", { score:"Meu Time 1 x 0 Rival" }),
  [file("home_crest"), file("away_crest"), file("athlete_photos")]
)[0].order;
assert.equal(athleteResult.assets.player_photo.files.length, 1);

const individualAthleteResult = bridge.omascoteChatBuildCleanOrders(
  draft("resultado_jogo_jogador", { sport:"Natação", score:"Ana ficou em 2º lugar nos 100 m livre" }),
  [file("athlete_photos")]
)[0].order;
assert.deepEqual(individualAthleteResult.fields.score, { text:"Ana ficou em 2º lugar nos 100 m livre" });

const playerCards = bridge.omascoteChatBuildCleanOrders(
  draft("jogador_escudo", { players:"Ana\nBia", sample:"Amostra 2" }),
  [file("team_crest"), file("player_photos"), file("player_photos")]
);
assert.equal(playerCards.length, 2);
assert.equal(playerCards[1].order.fields.player_name, "Bia");
assert.equal(playerCards[0].order.assets.player_photo.files.length, 1);

const contracts = bridge.omascoteChatBuildCleanOrders(
  draft("contratacao", { style:"Amostra 2", players:"Ana | Ala | Contratado | Não\nBia | Pivô | Renovado | Sim" }),
  [file("team_crest"), file("player_photos"), file("player_photos"), file("jersey_reference")]
);
assert.equal(contracts.length, 2);
assert.equal(contracts[1].order.fields.announcement_type, "renovado");
assert.equal(contracts[1].order.fields.jersey_enabled, true);
assert.equal(contracts[0].order.fields.sample_id, "", "as amostras antigas não podem voltar no pedido");

const firstId = bridge.omascoteChatClientRequestId("mesmo-rascunho", 0);
const secondId = bridge.omascoteChatClientRequestId("mesmo-rascunho", 0);
assert.equal(firstId, secondId, "a repetição precisa preservar a idempotência");

assert.equal(listeners.has("message"), true, "listener seguro do iframe não foi registrado");

(async () => {
  await listeners.get("message")({
    source:integratedChatFrame.contentWindow,
    origin:"http://localhost:4173",
    data:{ type:"omascote-chat:open-account" }
  });
  assert.equal(accountOpened, 1, "Minha conta precisa abrir somente pelo iframe autorizado");

  await listeners.get("message")({
    source:integratedChatFrame.contentWindow,
    origin:"http://localhost:4173",
    data:{ type:"omascote-chat:open-orders" }
  });
  assert.equal(ordersOpened, 1, "Pedidos precisa abrir o histórico real pelo iframe autorizado");

  const noImageSubmission = await bridge.omascoteChatSubmitOrders(
    draft("proximo_jogo", { matchup:"Meu Time x Rival", match_datetime:"domingo 16h", competition:"Copa", photo_mode:"Sem foto" }),
    []
  );
  assert.equal(noImageSubmission.ok, true, "o pedido sem nenhuma imagem precisa chegar à API");
  assert.equal(legacyBuildCalls[0].options.allowSavedEscudoFallback, false, "o pedido sem imagem não pode anexar escudo salvo");
  submitted.length = 0;
  legacyBuildCalls.length = 0;

  const submission = await bridge.omascoteChatSubmitOrders(
    draft("proximo_jogo", { matchup:"Meu Time x Rival", match_datetime:"domingo 16h", competition:"Copa" }),
    [file("home_crest"), file("away_crest")]
  );
  assert.equal(submission.ok, true);
  assert.equal(submission.orders[0].id, "pedido-chat-1");
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].url, "https://api.omascote.test/pedidos");
  assert.match(submitted[0].options.headers.Authorization, /^Bearer /);
  assert.ok(submitted[0].options.headers["X-Idempotency-Key"]);
  assert.equal(legacyBuildCalls[0].options.allowSavedEscudoFallback, false, "o chat não pode anexar escudo salvo de pedido ou perfil anterior");
  submitted.length = 0;
  legacyBuildCalls.length = 0;

  const batch = await bridge.omascoteChatSubmitOrderBatch([
    { draft:draft("proximo_jogo", { matchup:"Meu Time x Rival", match_datetime:"2026-09-20T16:00", competition:"Copa" }), files:[file("home_crest"), file("away_crest")] },
    { draft:{...draft("proximo_jogo", { matchup:"Meu Time x União", match_datetime:"2026-09-27T16:00", competition:"Copa" }),id:"rascunho-proximo-jogo-2"}, files:[file("home_crest"), file("away_crest")] }
  ]);
  assert.equal(batch.ok, true);
  assert.equal(submitted.length, 2, "dois jogos escolhidos precisam criar dois pedidos reais");
  assert.equal(legacyBuildCalls.length, 2);
  console.log("OK - chat integrado mapeia os 10 produtos pagos, usa a API do motor e preserva idempotência e origem permitida");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
