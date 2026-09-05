const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(__dirname + "/app.html", "utf8");

for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc=|application\/ld\+json/.test(match[1])) new vm.Script(match[2]);
}

function functionSource(name) {
  const match = html.match(new RegExp("^(?:async )?function " + name + "\\([^]*?^}", "m"));
  assert.ok(match, "funcao ausente: " + name);
  return match[0];
}

const names = [
  "ia4EstaEmModoApp",
  "ia4AppModeHeaders",
  "formatarValorPlanoSemanal",
  "formatarDataPlanoSemanal",
  "weeklyPlansDisponiveis",
  "renderizarResumoPlanoSemanal",
  "definirTituloModalPlanosSemanais",
  "definirStatusModalPlanoSemanal",
  "renderizarPlanosSemanais",
  "criarIdempotenciaPlanoSemanal",
  "obterIntencaoCompraPlanoSemanal",
  "comprarPlanoSemanal"
];
const source = names.map(functionSource).join("\n");

const catalog = {
  ok: true,
  disponivel: true,
  ciclo_dias: 30,
  renovacao_automatica: false,
  pagamento: "pix",
  planos: [
    { codigo: "semanal_1", nome: "1 imagem por semana", imagens_por_semana: 1, imagens_no_ciclo: 4, valor_centavos: 1890 },
    { codigo: "semanal_2", nome: "2 imagens por semana", imagens_por_semana: 2, imagens_no_ciclo: 8, valor_centavos: 2890 }
  ]
};

function makeContext(search, loggedIn = true) {
  const calls = [];
  const nodes = {
    weeklyPlanAccountCard: { hidden: true },
    weeklyPlanAccountTitle: { textContent: "" },
    weeklyPlanAccountText: { textContent: "" },
    weeklyPlanOpenBtn: { textContent: "", disabled: false },
    weeklyPlansBody: {
      innerHTML: "",
      querySelectorAll() { return []; }
    },
    weeklyPlansModalTitle: { textContent: "" },
    weeklyPlanModalStatus: { textContent: "", style: {} }
  };
  const context = vm.createContext({
    URLSearchParams,
    Date,
    Math,
    Uint32Array,
    AbortController,
    setTimeout,
    clearTimeout,
    window: {
      location: { search },
      crypto: { randomUUID: () => "12345678-1234-4234-9234-123456789abc" }
    },
    document: {
      referrer: "",
      getElementById: id => nodes[id] || null,
      querySelectorAll: () => []
    },
    API_BASE: "https://example.test",
    token: loggedIn ? "local-test-only" : "",
    weeklyPlansCatalog: catalog,
    weeklyPlanSummary: null,
    weeklyPlanSummaryState: loggedIn ? "loaded" : "anonymous",
    weeklyPlanPayment: null,
    weeklyPlanPurchaseIntent: null,
    acaoDepoisDoCadastro: null,
    htmlEscape: value => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
    ia4LerJsonSeguro: response => response.json(),
    ia4TratarAuthInvalida: () => "",
    ia4TratarContaInexistente: () => "",
    ia4Track() {},
    salvarPersistenciaPlanoSemanal() {
      calls.push({ persisted: true });
    },
    limparPersistenciaPlanoSemanal() {
      calls.push({ clearedPersistence: true });
    },
    carregarResumoPlanoSemanal: async () => null,
    renderizarPagamentoPlanoSemanal(data) {
      calls.push({ renderedPayment: data.tentativa_id });
    },
    iniciarPollingPlanoSemanal() {
      calls.push({ polling: true });
    },
    fecharModalPlanosSemanais() {
      calls.push({ closed: true });
    },
    abrirCadastroVisitanteModal() {
      calls.push({ registration: true });
    },
    abrirModalPlanosSemanais() {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          ok: true,
          tentativa_id: "attempt-local-123",
          plano: catalog.planos[1],
          pix_copia_cola: "PIX-PLANO-LOCAL",
          qr_code_base64: "aGVsbG8=",
          expira_em: "2099-01-01T00:00:00.000Z"
        })
      };
    }
  });
  vm.runInContext(source, context);
  return { context, calls, nodes };
}

async function verify() {
  const unavailable = makeContext("", true);
  unavailable.context.weeklyPlansCatalog = { disponivel: false, planos: [] };
  unavailable.context.renderizarResumoPlanoSemanal();
  assert.equal(unavailable.nodes.weeklyPlanAccountCard.hidden, true);
  assert.equal(unavailable.calls.filter(call => call.url).length, 0);

  const render = makeContext("", true);
  render.context.renderizarPlanosSemanais();
  for (const value of ["R$ 18,90", "R$ 28,90"]) {
    assert.ok(render.nodes.weeklyPlansBody.innerHTML.includes(value), value);
  }
  for (const weekly of [1, 2]) {
    assert.ok(render.nodes.weeklyPlansBody.innerHTML.includes("Até " + weekly + " imagem"));
  }
  assert.doesNotMatch(render.nodes.weeklyPlansBody.innerHTML, /R\$ (?:38|48),90/);
  assert.match(render.nodes.weeklyPlansBody.innerHTML, /qualquer dia/);
  assert.match(render.nodes.weeklyPlansBody.innerHTML, /artes padrão de até R\$ 8/);
  assert.match(render.nodes.weeklyPlansBody.innerHTML, /Mascote \+ uniforme e adicionais não entram/);
  assert.match(render.nodes.weeklyPlansBody.innerHTML, /sem cobrança automática/);

  const scheduled = makeContext("", true);
  scheduled.context.weeklyPlanSummary = {
    ativa:true,
    plano:{ codigo:"semanal_2", nome:"2 imagens por semana" },
    imagens_por_semana:2,
    disponiveis_na_semana:1,
    proximo_plano:{
      codigo:"semanal_1",
      nome:"1 imagem por semana",
      inicia_em:"2026-10-05T15:00:00.000Z"
    }
  };
  scheduled.context.renderizarPlanosSemanais();
  assert.match(scheduled.nodes.weeklyPlansBody.innerHTML, /Renovação já agendada/);
  assert.match(scheduled.nodes.weeklyPlansBody.innerHTML, /disabled/);

  const summaryFailure = makeContext("", true);
  summaryFailure.context.weeklyPlanSummaryState = "error";
  summaryFailure.context.renderizarPlanosSemanais();
  assert.match(summaryFailure.nodes.weeklyPlansBody.innerHTML, /Não foi possível confirmar seu plano/);
  assert.doesNotMatch(summaryFailure.nodes.weeklyPlansBody.innerHTML, /data-weekly-plan-code/);

  const visitor = makeContext("", false);
  await visitor.context.comprarPlanoSemanal("semanal_2");
  assert.equal(visitor.calls.filter(call => call.url).length, 0);
  assert.ok(visitor.calls.some(call => call.registration));

  for (const [search, expectedAppHeader] of [["", undefined], ["?omascote_app=1", "app"]]) {
    const purchase = makeContext(search, true);
    await purchase.context.comprarPlanoSemanal("semanal_2");
    await purchase.context.comprarPlanoSemanal("semanal_2");
    const requests = purchase.calls.filter(call => call.url);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "https://example.test/me/plano-semanal/gerar-pix");
    assert.equal(requests[0].options.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].options.body), { plano_id: "semanal_2" });
    assert.equal(requests[0].options.headers.Authorization, "Bearer local-test-only");
    assert.equal(requests[0].options.headers["Content-Type"], "application/json");
    assert.equal(requests[0].options.headers["X-Omascote-App-Mode"], expectedAppHeader);
    assert.ok(requests[0].options.headers["X-Idempotency-Key"].length >= 12);
    assert.equal(
      requests[0].options.headers["X-Idempotency-Key"],
      requests[1].options.headers["X-Idempotency-Key"]
    );
    assert.equal(Object.keys(JSON.parse(requests[0].options.body)).length, 1);
  }

  const planSegment = html.slice(
    html.indexOf("function formatarValorPlanoSemanal"),
    html.indexOf("function formatarTempoEstimado")
  );
  assert.doesNotMatch(planSegment, /saldoPixAtual|pararPollingSaldoPix|comprar-creditos-pix/);
  assert.match(html, /id="weeklyPlansModal"/);
  assert.match(html, /id="pixQrModal"/);
  assert.match(planSegment, /sessionStorage/);
  assert.match(planSegment, /setTimeout\(\(\) =>/);
  assert.doesNotMatch(planSegment, /weeklyPlanPollingTimer = setInterval/);
  assert.match(planSegment, /O acompanhamento foi pausado/);
  assert.match(planSegment, /Estamos recuperando os dados deste Pix com segurança/);
  assert.match(planSegment, /signal:controller\.signal/);
  assert.match(html, /WEEKLY_PLAN_STATUS_TIMEOUT_MS = 15000/);

  console.log("OK - planos semanais, preços, Pix separado, idempotência, login e TWA validados");
}

verify().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
