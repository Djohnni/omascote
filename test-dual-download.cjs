const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(__dirname + "/app.html", "utf8");

for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc=|application\/ld\+json/.test(match[1])) new vm.Script(match[2]);
}

function functionSource(name) {
  const match = html.match(new RegExp("^(?:async )?function " + name + "\\([^]*?^}", "m"));
  assert.ok(match, "função ausente: " + name);
  return match[0];
}

const videoStateSource = [
  "pedidoIncluiVideoPago",
  "estadoEntregaVideoPedido"
].map(functionSource).join("\n");

const videoState = new Function(
  `${videoStateSource}\nreturn { pedidoIncluiVideoPago, estadoEntregaVideoPedido };`
)();

assert.equal(videoState.pedidoIncluiVideoPago({}), false, "pedido somente de imagem não pode ganhar botão de vídeo");
assert.equal(videoState.pedidoIncluiVideoPago({
  video_generation: { requested: true, commercial: true, status: "queued" }
}), true, "vídeo comercial solicitado precisa ser reconhecido");
assert.equal(videoState.pedidoIncluiVideoPago({
  fields: { delivery_mode: "image_video" },
  video_generation: { requested: true, status: "processing" }
}), true, "entrega imagem + vídeo precisa ser reconhecida");
assert.equal(videoState.pedidoIncluiVideoPago({ video_pronto: true }), true, "vídeo legado pronto precisa continuar disponível");
assert.equal(videoState.estadoEntregaVideoPedido({
  video_generation: { requested: true, commercial: true, status: "processing" }
}), "processando");
assert.equal(videoState.estadoEntregaVideoPedido({
  video_pronto: true,
  video_generation: { status: "completed" }
}), "pronto");
assert.equal(videoState.estadoEntregaVideoPedido({
  video_generation: { requested: true, commercial: true, status: "failed" }
}), "falhou");
assert.equal(videoState.estadoEntregaVideoPedido({
  video_generation: { requested: true, commercial: true, status: "not_generated" }
}), "falhou", "vídeo não gerado não pode ficar eternamente como em produção");

const menuStart = html.indexOf("function atualizarMenuPedidosTopo");
const menuEnd = html.indexOf("async function carregarHistorico", menuStart);
const historyEnd = html.indexOf("function configurarAcaoDownloadPedido", menuEnd);
assert.ok(menuStart >= 0 && menuEnd > menuStart && historyEnd > menuEnd, "cards de pedidos não encontrados");

const menuBlock = html.slice(menuStart, menuEnd);
const historyBlock = html.slice(menuEnd, historyEnd);
for (const [area, source] of [["menu", menuBlock], ["histórico", historyBlock]]) {
  assert.match(source, /data-pedido-download/, `${area}: ação da imagem precisa existir`);
  assert.match(source, /data-pedido-video-download/, `${area}: ação do vídeo precisa existir`);
  assert.match(source, /Baixar imagem/, `${area}: download da imagem precisa estar identificado`);
  assert.match(source, /Baixar vídeo de 8s/, `${area}: download do vídeo precisa estar identificado`);
  assert.match(source, /aprovarEBaixarVideoPedido/, `${area}: vídeo deve poder aprovar e baixar em um clique`);
  assert.match(source, /baixarVideoPedido/, `${area}: vídeo aprovado deve continuar disponível`);
  assert.match(source, /pagamentoPendente \?/, `${area}: pagamento pendente deve bloquear os downloads`);
}

assert.match(html, /Sua entrega inclui imagem \+ vídeo\./);
assert.match(html, /Imagem pronta · vídeo em produção\./);
assert.match(html, /O vídeo não foi concluído\. Fale com o suporte/);
assert.doesNotMatch(html, /Aprove a arte primeiro\. Depois o botão de vídeo ficará disponível/);
assert.doesNotMatch(html, /teste de vídeo não foi concluído/);

const watcher = functionSource("acompanharResultadoClean");
assert.match(watcher, /videoEncerrado/, "a consulta deve continuar enquanto o vídeo pago estiver em produção");
assert.match(watcher, /configurarAcaoDownloadVideoPedido/, "o resultado imediato precisa liberar o vídeo sem exigir a imagem primeiro");
assert.match(watcher, /pagamento_pendente === true/, "o resultado imediato precisa bloquear download com pagamento pendente");
assert.match(watcher, /limitePollingMs/, "a consulta do vídeo precisa ter prazo máximo");
assert.match(watcher, /setTimeout\(consultar, 5000\)/, "as consultas precisam ser sequenciais");
assert.doesNotMatch(watcher, /setInterval\(/, "as consultas não podem se sobrepor");

const restore = functionSource("restaurarPedidosAtivos");
const readyRestoreStart = restore.indexOf("if(pedido.imagem_pronta === true)");
const readyRestoreEnd = restore.indexOf("const state = cleanProductProgressTimers", readyRestoreStart);
assert.ok(readyRestoreStart >= 0 && readyRestoreEnd > readyRestoreStart, "restauração de imagem pronta não encontrada");
assert.doesNotMatch(
  restore.slice(readyRestoreStart, readyRestoreEnd),
  /acompanharResultadoClean/,
  "a atualização do histórico não pode reiniciar indefinidamente um watcher já encerrado"
);

const approval = functionSource("aprovarPedidoParaDownload");
assert.match(approval, /\/aprovar/, "a ação escolhida deve aprovar o pedido");
assert.match(approval, /baixarPedido/, "aprovar pela imagem deve baixar a imagem");
assert.match(approval, /baixarVideoPedido/, "aprovar pelo vídeo deve baixar o vídeo");
assert.match(approval, /atualizarAprovacaoNosDoisBotoes/, "os dois botões devem ser bloqueados durante a aprovação única do pedido");

const videoDownload = functionSource("baixarVideoPedido");
assert.match(videoDownload, /pedido_video:\$\{pedidoId\}:video/, "a trava de cliques do vídeo deve usar a mesma chave do download seguro");
assert.match(videoDownload, /formato: "video"/);
assert.match(videoDownload, /recurso: "pedido_video"/);

console.log("Entrega conjunta de imagem e vídeo validada.");
