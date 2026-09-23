(function(){
  "use strict";

  const copa = window.COPA_COLOMBIA;
  if(!copa) return;

  const COPA_ORDER_MAP_KEY = "copa_colombia_pedidos_por_jogo";

  const accountMapKey = () => {
    const authToken = String(localStorage.getItem("omascote_token") || "");
    if(!authToken) return "";

    let accountIdentity = authToken;
    try{
      const payloadPart = authToken.split(".")[1] || "";
      const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const payload = JSON.parse(decodeURIComponent(Array.from(atob(padded), char => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
      accountIdentity = String(payload?.whatsapp || payload?.sub || authToken);
    }catch{
      accountIdentity = authToken;
    }

    let hash = 2166136261;
    for(let index = 0; index < accountIdentity.length; index += 1){
      hash ^= accountIdentity.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${COPA_ORDER_MAP_KEY}:${(hash >>> 0).toString(16)}`;
  };

  const money = value => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(value);

  const escapeHtml = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const teamInitials = name => String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

  const groupClass = group => `group-${String(group || "").toLowerCase()}`;

  const crestMarkup = (team, className, size) => {
    const asset = copa.escudos?.[team];
    const src = String(asset?.arquivo || "");
    if(!asset || !src.startsWith("/copacolombia/escudos/")){
      return `<span class="${className}">${escapeHtml(teamInitials(team))}</span>`;
    }

    const values = [asset.sourceW, asset.sourceH, asset.x, asset.y, asset.w, asset.h].map(Number);
    if(values.every(Number.isFinite) && values[0] > 0 && values[1] > 0 && values[4] > 0 && values[5] > 0){
      const [sourceW, sourceH, x, y, w, h] = values;
      const scale = Math.min(size / w, size / h);
      const width = sourceW * scale;
      const height = sourceH * scale;
      const left = ((size - (w * scale)) / 2) - (x * scale);
      const top = ((size - (h * scale)) / 2) - (y * scale);
      return `<span class="${className} crestAsset" aria-hidden="true"><img class="crestAssetCrop" src="${escapeHtml(src)}" alt="" loading="lazy" style="width:${width.toFixed(3)}px;height:${height.toFixed(3)}px;left:${left.toFixed(3)}px;top:${top.toFixed(3)}px"></span>`;
    }

    return `<span class="${className} crestAsset" aria-hidden="true"><img src="${escapeHtml(src)}" alt="" loading="lazy"></span>`;
  };

  const formattedDate = iso => {
    const [year, month, day] = String(iso || "").split("-");
    return year && month && day ? `${day}/${month}/${year}` : iso;
  };

  const flyerUrl = match => {
    const params = new URLSearchParams({
      produto: "proximo_jogo",
      origem: "copacolombia",
      jogo: match.id,
      time_a: match.casa,
      time_b: match.fora,
      data_hora: `${formattedDate(match.data)} - ${match.hora}`,
      competicao: `${copa.nome} · ${match.rodada} · Grupo ${match.grupo}`,
      local: copa.local,
      titulo: `${match.rodada} · Grupo ${match.grupo}`
    });
    return `/app.html?${params.toString()}`;
  };

  const resultUrl = match => {
    const params = new URLSearchParams({
      produto: "resultado",
      origem: "copacolombia",
      jogo: match.id,
      time_a: match.casa,
      time_b: match.fora,
      data_hora: `${formattedDate(match.data)} - ${match.hora}`,
      competicao: `${copa.nome} · ${match.rodada} · Grupo ${match.grupo}`,
      local: copa.local,
      titulo: `Resultado · Grupo ${match.grupo}`
    });
    return `/app.html?${params.toString()}`;
  };

  const localOrderMap = () => {
    try{
      const key = accountMapKey();
      if(!key) return {};
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    }catch{
      return {};
    }
  };

  const artOrderForMatch = (match, product = "proximo_jogo") => {
    const orders = localOrderMap();
    const matchId = String(match?.id || "");
    const local = orders[`${matchId}:${product}`] || (product === "proximo_jogo" ? orders[matchId] : null);
    const pedidoId = String(local?.pedido_id || "").trim();
    if(pedidoId) return { pedido_id: pedidoId, status: String(local?.status || "processando"), product };
    return product === "proximo_jogo" && match?.arteDisponivel === true
      ? { pedido_id: "", status: "pronto", generic: true, product }
      : null;
  };

  const orderUrl = (match, order) => {
    const params = new URLSearchParams({ origem: "copacolombia-download", jogo: match.id });
    if(order.generic) params.set("pedidos", "1");
    else params.set("pedido", order.pedido_id);
    return `/app.html?${params.toString()}`;
  };

  const artActionMarkup = match => {
    const actions = [
      { order: artOrderForMatch(match, "proximo_jogo"), readyLabel: "Baixar flyer do jogo" },
      { order: artOrderForMatch(match, "resultado"), readyLabel: "Baixar flyer do resultado" }
    ].filter(item => item.order);
    if(!actions.length) return "";

    return `<div class="matchArtActions">${actions.map(({ order, readyLabel }) => {
      const ready = order.status === "pronto";
      return `
        <a class="matchArtButton${ready ? " isReady" : ""}" href="${escapeHtml(orderUrl(match, order))}"${order.pedido_id ? ` data-art-order="${escapeHtml(order.pedido_id)}"` : ""} data-art-match="${escapeHtml(match.id)}" data-art-product="${escapeHtml(order.product)}">
          <span aria-hidden="true">${ready ? "⬇️" : "⏳"}</span>
          ${ready ? readyLabel : "Acompanhar minha arte"}
        </a>
      `;
    }).join("")}</div>`;
  };

  function renderPrizes(){
    const root = document.getElementById("prizeGrid");
    if(!root) return;
    root.innerHTML = copa.premiacao.map(prize => `
      <article class="prizeCard${prize.destaque ? " prizeCardFeatured" : ""}">
        <span class="prizeIcon" aria-hidden="true">${escapeHtml(prize.icone)}</span>
        <div>
          <small>${escapeHtml(prize.posicao)}</small>
          <strong>${escapeHtml(money(prize.valor))}</strong>
        </div>
      </article>
    `).join("");
  }

  function matchCard(match){
    return `
      <article class="matchCard ${groupClass(match.grupo)}" data-match-group="${escapeHtml(match.grupo)}">
        <div class="matchTopline">
          <span>Grupo ${escapeHtml(match.grupo)}</span>
          <strong>${escapeHtml(match.hora)}</strong>
        </div>
        <div class="matchTeams">
          <div class="team">
            ${crestMarkup(match.casa, "teamBadge", 52)}
            <strong>${escapeHtml(match.casa)}</strong>
          </div>
          <div class="versus"><span>×</span><small>${escapeHtml(match.rodada)}</small></div>
          <div class="team teamAway">
            ${crestMarkup(match.fora, "teamBadge", 52)}
            <strong>${escapeHtml(match.fora)}</strong>
          </div>
        </div>
        ${artActionMarkup(match)}
        <div class="matchDetails"><span>📅 ${escapeHtml(formattedDate(match.data))}</span><span>📍 Arena do Vasco</span></div>
        <div class="matchFlyerActions">
          <a class="flyerButton" href="${escapeHtml(flyerUrl(match))}" data-flyer-match="${escapeHtml(match.id)}">
            <span>✨</span> Flyer do jogo
          </a>
          <a class="resultButton" href="${escapeHtml(resultUrl(match))}" data-result-match="${escapeHtml(match.id)}">
            <span>🏁</span> Gerar resultado
          </a>
        </div>
      </article>
    `;
  }

  function renderMatches(){
    const root = document.getElementById("matchGrid");
    if(!root) return;
    root.innerHTML = copa.jogos.map(matchCard).join("");
  }

  function renderGroups(){
    const root = document.getElementById("groupGrid");
    if(!root) return;
    root.innerHTML = Object.entries(copa.grupos).map(([group, teams]) => `
      <article class="groupCard ${groupClass(group)}">
        <header><span>Grupo</span><strong>${escapeHtml(group)}</strong></header>
        <ol>
          ${teams.map((team, index) => `
            <li>${crestMarkup(team, "groupTeamBadge", 30)}<strong>${escapeHtml(team)}</strong><small>${index + 1}</small></li>
          `).join("")}
        </ol>
      </article>
    `).join("");
  }

  function renderConfirmedTeams(){
    const root = document.getElementById("confirmedTeamsGrid");
    if(!root) return;
    root.innerHTML = (copa.confirmados || []).map(team => `
      <article class="confirmedTeamCard">
        ${crestMarkup(team, "confirmedTeamCrest", 76)}
        <strong>${escapeHtml(team)}</strong>
      </article>
    `).join("");
  }

  function calculateStandings(group){
    const teams = copa.grupos[group] || [];
    const table = teams.map(team => ({ team, p:0, j:0, v:0, e:0, d:0, gp:0, gc:0, sg:0 }));
    const byTeam = Object.fromEntries(table.map(row => [row.team, row]));

    copa.jogos.filter(match => match.grupo === group && Number.isFinite(match.golsCasa) && Number.isFinite(match.golsFora)).forEach(match => {
      const home = byTeam[match.casa];
      const away = byTeam[match.fora];
      if(!home || !away) return;
      home.j += 1; away.j += 1;
      home.gp += match.golsCasa; home.gc += match.golsFora;
      away.gp += match.golsFora; away.gc += match.golsCasa;
      if(match.golsCasa > match.golsFora){ home.v += 1; home.p += 3; away.d += 1; }
      else if(match.golsCasa < match.golsFora){ away.v += 1; away.p += 3; home.d += 1; }
      else { home.e += 1; away.e += 1; home.p += 1; away.p += 1; }
    });

    table.forEach(row => { row.sg = row.gp - row.gc; });
    return table.sort((a, b) => b.p - a.p || b.v - a.v || b.sg - a.sg || b.gp - a.gp || a.team.localeCompare(b.team, "pt-BR"));
  }

  function renderStandings(group = "A"){
    const root = document.getElementById("standingsCard");
    if(!root) return;
    const rows = calculateStandings(group);
    root.innerHTML = `
      <div class="standingsTitle"><strong>Grupo ${escapeHtml(group)}</strong><span>Atualizada antes da 1ª rodada</span></div>
      <div class="standingsTable" role="table" aria-label="Classificação do Grupo ${escapeHtml(group)}">
        <div class="standingsRow standingsHeader" role="row"><span>#</span><span>Time</span><span>P</span><span>J</span><span>V</span><span>SG</span></div>
        ${rows.map((row, index) => `
          <div class="standingsRow" role="row">
            <span>${index + 1}</span>
            <span class="standingTeam">${crestMarkup(row.team, "standingTeamCrest", 30)}<strong>${escapeHtml(row.team)}</strong></span>
            <span><strong>${row.p}</strong></span><span>${row.j}</span><span>${row.v}</span><span>${row.sg}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderStandingsTabs(){
    const root = document.getElementById("standingsTabs");
    if(!root) return;
    root.innerHTML = Object.keys(copa.grupos).map((group, index) => `
      <button type="button" class="standingsTab${index === 0 ? " isActive" : ""}" data-standings-group="${escapeHtml(group)}" aria-pressed="${index === 0 ? "true" : "false"}">Grupo ${escapeHtml(group)}</button>
    `).join("");
    root.addEventListener("click", event => {
      const button = event.target.closest("[data-standings-group]");
      if(!button) return;
      root.querySelectorAll("[data-standings-group]").forEach(item => {
        const active = item === button;
        item.classList.toggle("isActive", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderStandings(button.dataset.standingsGroup || "A");
    });
  }

  renderPrizes();
  renderMatches();
  renderConfirmedTeams();
  renderGroups();
  renderStandingsTabs();
  renderStandings();
})();
