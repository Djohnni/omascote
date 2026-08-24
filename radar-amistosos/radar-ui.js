(function () {
  "use strict";

  const data = window.RadarDemoData;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function selected(current, value) {
    return current === value ? " selected" : "";
  }

  function icon(name) {
    const paths = {
      home: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z"/><path d="M9 21v-7h6v7"/>',
      radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v2m10 8h-2m-8 10v-2M2 12h2m8 0 5-5"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".5"/><circle cx="3.5" cy="12" r=".5"/><circle cx="3.5" cy="18" r=".5"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      shield: '<path d="M12 3 4.5 6v5.5c0 4.7 3.1 8 7.5 9.5 4.4-1.5 7.5-4.8 7.5-9.5V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      arrow: '<path d="m9 18 6-6-6-6"/>',
      back: '<path d="m15 18-6-6 6-6"/>',
      upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
      edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      location: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'
    };
    return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.radar}</svg>`;
  }

  function button(label, options) {
    const opts = options || {};
    return `<button class="button ${opts.kind ? `button--${opts.kind}` : "button--primary"}${opts.full ? " button--full" : ""}" type="${opts.type || "button"}"${opts.action ? ` data-action="${esc(opts.action)}"` : ""}${opts.target ? ` data-target="${esc(opts.target)}"` : ""}${opts.id ? ` data-id="${esc(opts.id)}"` : ""}${opts.disabled ? " disabled" : ""}>${opts.icon ? icon(opts.icon) : ""}<span>${esc(label)}</span>${opts.trailing ? icon(opts.trailing) : ""}</button>`;
  }

  function statusPill(status) {
    const labels = {
      active: ["Ativa", "success"],
      paused: ["Pausada", "warning"],
      cancelled: ["Cancelada", "neutral"],
      pending: ["Em análise", "warning"],
      verified: ["Verificado", "success"]
    };
    const item = labels[status] || [status, "neutral"];
    return `<span class="status status--${item[1]}"><span class="status__dot"></span>${esc(item[0])}</span>`;
  }

  function crest(initials, extraClass) {
    return `<span class="team-crest ${extraClass || ""}" aria-label="Escudo demonstrativo do time"><span>${esc(initials)}</span></span>`;
  }

  function screenHeader(eyebrow, title, description, actionHtml) {
    return `<header class="screen-header">
      <div>
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h1>${esc(title)}</h1>
        ${description ? `<p class="screen-header__description">${esc(description)}</p>` : ""}
      </div>
      ${actionHtml ? `<div class="screen-header__action">${actionHtml}</div>` : ""}
    </header>`;
  }

  function renderHome(state) {
    const profile = state.profile;
    return `<div class="screen screen--home">
      ${screenHeader("Central do time", "Olá, Estrela do Norte!", "Organize seu clube e encontre a próxima partida.")}
      <section class="team-summary card" aria-label="Resumo do time">
        <div class="team-summary__identity">
          ${crest(profile.crestInitials)}
          <div><p class="overline">Seu clube</p><h2>${esc(profile.teamName)}</h2><p>${icon("location")} ${esc(profile.city)}, ${esc(profile.state)}</p></div>
        </div>
        <div class="team-summary__metrics" aria-label="Números do time">
          <div><strong>24</strong><span>jogadores</span></div>
          <div><strong>8</strong><span>partidas</span></div>
          <div><strong>4,8</strong><span>conduta</span></div>
        </div>
        <button class="quiet-link" type="button" data-action="preview-team">${icon("eye")} Ver perfil público</button>
      </section>

      <section class="feature-card" aria-labelledby="feature-title">
        <div class="feature-card__copy">
          <span class="feature-card__tag">NOVO NO MEU CLUBE FC</span>
          <p class="eyebrow eyebrow--gold">Radar de Amistosos</p>
          <h2 id="feature-title">Seu próximo adversário pode estar bem perto.</h2>
          <p>Mostre quando seu time quer jogar, encontre clubes compatíveis e combine o amistoso com mais confiança.</p>
          <div class="feature-card__actions">
            ${button("Encontrar amistoso", { action: "navigate", target: "eligibility", trailing: "arrow" })}
            <span>${icon("shield")} Contato só depois do aceite</span>
          </div>
        </div>
        <div class="radar-visual" aria-hidden="true">
          <div class="radar-visual__ring radar-visual__ring--one"></div>
          <div class="radar-visual__ring radar-visual__ring--two"></div>
          <div class="radar-visual__sweep"></div>
          <span class="radar-visual__point radar-visual__point--a"></span>
          <span class="radar-visual__point radar-visual__point--b"></span>
          <span class="radar-visual__point radar-visual__point--c"></span>
          <div class="radar-visual__center">${crest("EN", "team-crest--small")}</div>
        </div>
      </section>

      <section class="quick-grid" aria-label="Atalhos do clube">
        <button class="quick-card" type="button" data-action="navigate" data-target="profile-manual"><span>${icon("user")}</span><strong>Perfil do time</strong><small>Atualize as informações</small></button>
        <button class="quick-card" type="button" data-action="navigate" data-target="availabilities"><span>${icon("calendar")}</span><strong>Disponibilidades</strong><small>Veja suas publicações</small></button>
        <button class="quick-card" type="button" data-action="navigate" data-target="states"><span>${icon("shield")}</span><strong>Estados da tela</strong><small>Confira todos os retornos</small></button>
      </section>
    </div>`;
  }

  function eligibilityItems(state) {
    const verified = state.verification.status === "verified";
    const profileReady = state.profileReady;
    return [
      { label: "Perfil público do time", detail: "Visível para os clubes do Radar", ready: true },
      { label: "Cidade e estado", detail: `${state.profile.city}, ${state.profile.state}`, ready: true },
      { label: "Dados esportivos", detail: profileReady ? `${state.profile.modality} · ${state.profile.category}` : "Revise modalidade, categoria e nível", ready: profileReady },
      { label: "Instagram do time", detail: verified ? "Controle do perfil aprovado" : state.verification.status === "pending" ? "Comprovação em análise" : "Comprove que você controla o perfil", ready: verified, pending: state.verification.status === "pending" },
      { label: "Termos do Radar", detail: "Aceitos para esta demonstração", ready: true }
    ];
  }

  function renderEligibility(state) {
    const items = eligibilityItems(state);
    const completed = items.filter((item) => item.ready).length;
    const verified = state.verification.status === "verified";
    return `<div class="screen screen--narrow">
      ${screenHeader("Antes de entrar no Radar", "Vamos preparar seu time", "Estas informações ajudam a criar partidas mais seguras e compatíveis.")}
      <section class="progress-card card">
        <div class="progress-card__top"><span>${completed} de ${items.length} etapas prontas</span><strong>${Math.round((completed / items.length) * 100)}%</strong></div>
        <div class="progress-track" aria-label="${completed} de ${items.length} etapas prontas"><span style="width:${(completed / items.length) * 100}%"></span></div>
      </section>
      <section class="checklist" aria-label="Requisitos do Radar">
        ${items.map((item) => `<article class="check-item${item.ready ? " check-item--ready" : ""}${item.pending ? " check-item--pending" : ""}">
          <span class="check-item__icon">${item.ready ? icon("check") : item.pending ? icon("more") : icon("lock")}</span>
          <div><h2>${esc(item.label)}</h2><p>${esc(item.detail)}</p></div>
          <span class="check-item__state">${item.ready ? "Pronto" : item.pending ? "Em análise" : "Pendente"}</span>
        </article>`).join("")}
      </section>
      ${verified ? `<div class="action-panel action-panel--success"><div>${icon("shield")}<div><strong>Seu time está pronto para o Radar</strong><p>Agora você já pode publicar quando quer jogar.</p></div></div>${button("Criar disponibilidade", { action: "new-availability", full: true, trailing: "arrow" })}</div>`
        : `<div class="action-panel"><div><span class="step-number">1</span><div><strong>Complete o perfil do time</strong><p>Use um print para gerar um rascunho ou preencha os campos.</p></div></div>${button("Usar print do Instagram", { action: "navigate", target: "print-import", full: true, icon: "upload" })}${button("Preencher manualmente", { action: "navigate", target: "profile-manual", full: true, kind: "secondary" })}</div>`}
      <p class="privacy-note">${icon("lock")} Seus dados de contato não aparecem nesta etapa.</p>
    </div>`;
  }

  function renderManualProfile(state) {
    const p = state.profile;
    return `<div class="screen screen--form">
      ${screenHeader("Cadastro do Radar", "Conte como é o seu time", "Você poderá editar tudo antes de deixar o perfil disponível.")}
      <form class="form-card card" data-form="manual-profile">
        <div class="form-section-heading"><span>01</span><div><h2>Identidade do time</h2><p>Informações que os adversários verão.</p></div></div>
        <div class="field-grid field-grid--two">
          <label class="field field--wide"><span>Nome do time</span><input name="teamName" maxlength="70" required value="${esc(p.teamName)}"></label>
          <label class="field"><span>Instagram</span><input name="instagram" maxlength="40" required value="${esc(p.instagram)}" inputmode="text"><small>Use o mesmo perfil que será verificado.</small></label>
          <label class="field"><span>Cidade</span><input name="city" maxlength="60" required value="${esc(p.city)}"></label>
          <label class="field"><span>Estado</span><select name="state" required><option value="SC"${selected(p.state, "SC")}>Santa Catarina</option><option value="PR"${selected(p.state, "PR")}>Paraná</option><option value="RS"${selected(p.state, "RS")}>Rio Grande do Sul</option></select></label>
        </div>
        <div class="form-divider"></div>
        <div class="form-section-heading"><span>02</span><div><h2>Perfil esportivo</h2><p>Ajuda o Radar a sugerir partidas equilibradas.</p></div></div>
        <div class="field-grid field-grid--three">
          <label class="field"><span>Modalidade</span><select name="modality"><option${selected(p.modality, "Futebol society")}>Futebol society</option><option${selected(p.modality, "Futsal")}>Futsal</option><option${selected(p.modality, "Campo")}>Campo</option></select></label>
          <label class="field"><span>Categoria</span><select name="category"><option${selected(p.category, "Livre")}>Livre</option><option${selected(p.category, "Veterano")}>Veterano</option><option${selected(p.category, "Sub-20")}>Sub-20</option></select></label>
          <label class="field"><span>Nível</span><select name="level"><option${selected(p.level, "Iniciante")}>Iniciante</option><option${selected(p.level, "Intermediário")}>Intermediário</option><option${selected(p.level, "Competitivo")}>Competitivo</option></select></label>
          <label class="field field--wide"><span>Sobre o time</span><textarea name="summary" rows="4" maxlength="240">${esc(p.summary)}</textarea><small>Não coloque telefone ou contato pessoal.</small></label>
        </div>
        <label class="consent"><input type="checkbox" required checked><span>${icon("check")}</span><span>Confirmo que o perfil pode ficar público no Radar e aceito os termos da demonstração.</span></label>
        <div class="form-actions">${button("Voltar", { action: "back", kind: "ghost" })}${button("Salvar e continuar", { type: "submit", trailing: "arrow" })}</div>
      </form>
    </div>`;
  }

  function previewMarkup(state) {
    if (!state.importedPreview) return "";
    if (state.importedPreview === "demo") {
      return `<div class="instagram-preview instagram-preview--demo" role="img" aria-label="Prévia fictícia de um perfil do Instagram">
        <div class="instagram-preview__bar"><span></span><strong>Instagram</strong><span>•••</span></div>
        <div class="instagram-preview__profile">${crest("EN", "team-crest--tiny")}<div><strong>estreladonortefc</strong><small>Estrela do Norte FC · Joinville</small></div></div>
        <div class="instagram-preview__stats"><span><strong>148</strong> publicações</span><span><strong>2,4 mil</strong> seguidores</span><span><strong>312</strong> seguindo</span></div>
        <div class="instagram-preview__tiles"><span></span><span></span><span></span></div>
      </div>`;
    }
    return `<div class="instagram-preview"><img src="${esc(state.importedPreview)}" alt="Prévia local do print selecionado"></div>`;
  }

  function renderPrintImport(state) {
    return `<div class="screen screen--narrow">
      ${screenHeader("Cadastro assistido", "Importe um print do perfil", "A IA criará somente um rascunho fictício. Você revisa antes de usar.")}
      <div class="info-strip">${icon("shield")} <span><strong>Nesta demonstração, nada é enviado.</strong> A imagem fica somente no seu navegador e não é salva.</span></div>
      <section class="upload-card card${state.importedPreview ? " upload-card--has-preview" : ""}">
        ${previewMarkup(state) || `<div class="upload-card__empty"><span class="upload-card__icon">${icon("upload")}</span><h2>Escolha um print do Instagram</h2><p>Use uma imagem clara mostrando nome, bio e escudo do time.</p></div>`}
        <div class="upload-card__actions">
          <label class="button button--secondary button--full" for="profile-print">${icon("upload")}<span>${state.importedPreview ? "Trocar imagem" : "Escolher imagem"}</span></label>
          <input class="sr-only" id="profile-print" type="file" accept="image/png,image/jpeg,image/webp" data-input="profile-print">
          ${button("Usar print demonstrativo", { action: "demo-print", kind: "ghost", full: true })}
        </div>
      </section>
      <div class="safe-list card">
        <h2>O que acontece depois?</h2>
        <ol><li><span>1</span><p>A IA sugere os campos do time.</p></li><li><span>2</span><p>Você corrige qualquer informação.</p></li><li><span>3</span><p>O Instagram ainda passa por verificação.</p></li></ol>
      </div>
      ${button("Criar rascunho do perfil", { action: "create-draft", full: true, trailing: "arrow", disabled: !state.importedPreview })}
    </div>`;
  }

  function renderDraftReview(state) {
    const d = state.draft;
    return `<div class="screen screen--form">
      ${screenHeader("Rascunho da IA", "Revise antes de continuar", "A IA pode errar. O responsável pelo time confirma cada informação.")}
      <div class="draft-layout">
        <aside class="draft-source card">
          <div class="draft-source__label">PRINT USADO</div>
          ${previewMarkup({ importedPreview: state.importedPreview || "demo" })}
          <div class="confidence"><div><span>Confiança do rascunho</span><strong>${d.confidence}%</strong></div><span><i style="width:${d.confidence}%"></i></span></div>
          <p>${icon("shield")} Rascunho demonstrativo. Nada foi verificado ou publicado.</p>
        </aside>
        <form class="form-card card" data-form="draft-review">
          <div class="form-section-heading"><span>${icon("edit")}</span><div><h2>Dados encontrados</h2><p>Toque em qualquer campo para corrigir.</p></div></div>
          <div class="field-grid field-grid--two">
            <label class="field field--wide"><span>Nome do time <em>Alta confiança</em></span><input name="teamName" required value="${esc(d.teamName)}"></label>
            <label class="field"><span>Instagram <em>Alta confiança</em></span><input name="instagram" required value="${esc(d.instagram)}"></label>
            <label class="field"><span>Cidade</span><input name="city" required value="${esc(d.city)}"></label>
            <label class="field"><span>Estado</span><select name="state"><option value="SC" selected>Santa Catarina</option><option value="PR">Paraná</option></select></label>
            <label class="field"><span>Modalidade</span><select name="modality"><option selected>Futebol society</option><option>Futsal</option><option>Campo</option></select></label>
            <label class="field"><span>Categoria</span><select name="category"><option selected>Livre</option><option>Veterano</option><option>Sub-20</option></select></label>
            <label class="field"><span>Nível</span><select name="level"><option>Iniciante</option><option selected>Intermediário</option><option>Competitivo</option></select></label>
            <label class="field field--wide"><span>Sobre o time</span><textarea name="summary" rows="4">${esc(d.summary)}</textarea></label>
          </div>
          <div class="review-warning">${icon("eye")} <span><strong>Confira principalmente cidade e categoria.</strong> Esses dados influenciam as sugestões do Radar.</span></div>
          <div class="form-actions">${button("Voltar ao print", { action: "navigate", target: "print-import", kind: "ghost" })}${button("Confirmar rascunho", { type: "submit", trailing: "arrow" })}</div>
        </form>
      </div>
    </div>`;
  }

  function renderVerification(state) {
    const verification = state.verification;
    if (verification.status === "pending") return renderPendingVerification(state);
    if (verification.status === "verified") return renderApprovedVerification(state);
    const challenge = verification.status === "challenge";
    return `<div class="screen screen--narrow">
      ${screenHeader("Segurança do Radar", "Verifique o Instagram do time", "A comprovação reduz perfis falsos e ajuda os clubes a jogar com mais confiança.")}
      <section class="verification-hero card">
        <div class="instagram-mark">◎</div>
        <div><p>Perfil informado</p><h2>${esc(state.profile.instagram)}</h2><span>${icon("lock")} Somente o responsável pode solicitar</span></div>
      </section>
      ${challenge ? `<section class="challenge-card">
        <div class="challenge-card__top"><span>SEU CÓDIGO TEMPORÁRIO</span>${statusPill("pending")}</div>
        <button class="challenge-code" type="button" data-action="copy-code" aria-label="Copiar código demonstrativo">MCF<span>-</span>4827 ${icon("edit")}</button>
        <p>Este é um código fictício para visualizar o processo. Ele não comprova um perfil real.</p>
      </section>
      <section class="steps-card card"><h2>Agora faça assim</h2><ol>
        <li><span>1</span><div><strong>Copie o código</strong><p>Toque no código acima.</p></div></li>
        <li><span>2</span><div><strong>Coloque na bio do Instagram</strong><p>Mantenha o código visível durante a análise.</p></div></li>
        <li><span>3</span><div><strong>Volte e avise que concluiu</strong><p>A confirmação entra em uma fila de revisão.</p></div></li>
      </ol></section>
      ${button("Já coloquei o código na bio", { action: "confirm-verification", full: true, trailing: "arrow" })}`
      : `<section class="explain-card card">
        <div class="explain-card__visual">${icon("shield")}<span>${icon("check")}</span></div>
        <h2>Você controla este perfil?</h2>
        <p>Vamos gerar um código temporário do Meu Clube FC para colocar na bio. Depois, a comprovação segue para revisão — nunca é aprovada automaticamente.</p>
        <ul><li>${icon("check")} Código temporário</li><li>${icon("check")} Revisão antes da aprovação</li><li>${icon("check")} Sem scraping do Instagram</li></ul>
      </section>
      ${button("Gerar código demonstrativo", { action: "start-verification", full: true, trailing: "arrow" })}`}
      <p class="privacy-note">${icon("lock")} O Meu Clube FC nunca pede a senha do seu Instagram.</p>
    </div>`;
  }

  function renderPendingVerification(state) {
    return `<div class="screen screen--narrow state-centered">
      ${screenHeader("Verificação do Instagram", "Comprovação em análise", "O código foi informado e a solicitação entrou na fila de revisão.")}
      <section class="state-illustration state-illustration--pending"><span class="state-illustration__ring"></span>${icon("more")}</section>
      ${statusPill("pending")}
      <h2>${esc(state.profile.instagram)}</h2>
      <p>Na operação real, somente uma pessoa autorizada poderá aprovar. O responsável pelo time nunca aprova a própria solicitação.</p>
      <div class="review-timeline card"><div class="done">${icon("check")}<span><strong>Solicitação criada</strong><small>Código temporário emitido</small></span></div><div class="done">${icon("check")}<span><strong>Responsável confirmou</strong><small>Código colocado na bio</small></span></div><div class="current">${icon("more")}<span><strong>Revisão segura</strong><small>Aguardando análise</small></span></div></div>
      <div class="demo-action-box"><p><strong>Apenas na demonstração:</strong> avance para visualizar como fica após a aprovação.</p>${button("Simular aprovação da revisão", { action: "approve-verification", full: true })}</div>
    </div>`;
  }

  function renderApprovedVerification(state) {
    return `<div class="screen screen--narrow state-centered">
      ${screenHeader("Verificação concluída", "Time pronto para o Radar", "O perfil demonstrativo passou pela revisão e já pode publicar disponibilidades.")}
      <section class="success-seal">${icon("shield")}<span>${icon("check")}</span></section>
      ${statusPill("verified")}
      <h2>${esc(state.profile.teamName)}</h2>
      <p>${esc(state.profile.instagram)} · ${esc(state.profile.city)}, ${esc(state.profile.state)}</p>
      <div class="verified-benefits card"><div>${icon("check")} Perfil com controle comprovado</div><div>${icon("check")} Elegível para publicar no Radar</div><div>${icon("lock")} Contato protegido até o aceite</div></div>
      ${button("Criar primeira disponibilidade", { action: "new-availability", full: true, trailing: "arrow" })}
      ${button("Voltar à elegibilidade", { action: "navigate", target: "eligibility", kind: "ghost", full: true })}
    </div>`;
  }

  function availabilityCard(item) {
    const disabled = item.status === "cancelled";
    return `<article class="availability-card card availability-card--${esc(item.status)}">
      <div class="availability-card__top"><div>${statusPill(item.status)}<span class="availability-card__type">${esc(item.category)} · ${esc(item.level)}</span></div><button class="icon-button" type="button" data-action="availability-details" data-id="${esc(item.id)}" aria-label="Ver detalhes">${icon("more")}</button></div>
      <h2>${esc(item.title)}</h2>
      <div class="availability-card__facts"><span>${icon("calendar")}<strong>${esc(item.dateLabel)}</strong><small>${esc(item.period)}</small></span><span>${icon("location")}<strong>${esc(item.city)}</strong><small>${esc(item.radius)}</small></span></div>
      <p class="availability-card__notes">${esc(item.notes)}</p>
      <div class="availability-card__footer"><span>${icon("shield")} ${esc(item.homeAway)}</span><div>
        ${button("Editar", { action: "edit-availability", id: item.id, kind: "small", icon: "edit", disabled })}
        ${button(item.status === "paused" ? "Reativar" : "Pausar", { action: "toggle-availability", id: item.id, kind: "small", disabled })}
        ${button("Cancelar", { action: "cancel-availability", id: item.id, kind: "danger-small", disabled })}
      </div></div>
    </article>`;
  }

  function renderAvailabilities(state) {
    const activeCount = state.availabilities.filter((item) => item.status === "active").length;
    return `<div class="screen screen--wide">
      ${screenHeader("Radar de Amistosos", "Suas disponibilidades", `${activeCount} ${activeCount === 1 ? "publicação ativa" : "publicações ativas"} no momento.`, button("Nova disponibilidade", { action: "new-availability", icon: "calendar" }))}
      <div class="list-toolbar card"><div><span>${icon("radar")}</span><div><strong>Radar ligado para ${esc(state.profile.city)}</strong><p>Sugestões em um raio de até 25 km</p></div></div><button class="quiet-link" type="button" data-action="notify-settings">Ajustar preferências</button></div>
      <section class="availability-grid" aria-label="Lista de disponibilidades">
        ${state.availabilities.length ? state.availabilities.map(availabilityCard).join("") : renderInlineEmpty()}
      </section>
      <section class="opponents-section">
        <div class="section-title"><div><p class="eyebrow">Por perto</p><h2>Times que combinam com seu perfil</h2></div><button class="quiet-link" type="button" data-action="notify-opponents">Ver todos</button></div>
        <div class="opponent-grid">${data.suggestedOpponents.map((team) => `<article class="opponent-card card">${crest(team.initials, "team-crest--small")}<div><h3>${esc(team.name)} ${team.verified ? `<span title="Perfil verificado">${icon("check")}</span>` : ""}</h3><p>${esc(team.distance)} · ${esc(team.level)}</p><small>${icon("shield")} ${esc(team.conduct)}</small></div><button class="icon-button" type="button" data-action="notify-opponent" aria-label="Ver ${esc(team.name)}">${icon("arrow")}</button></article>`).join("")}</div>
      </section>
    </div>`;
  }

  function renderInlineEmpty() {
    return `<div class="inline-empty card">${icon("calendar")}<h2>Nenhuma disponibilidade</h2><p>Publique os melhores dias e horários para seu time jogar.</p>${button("Criar disponibilidade", { action: "new-availability" })}</div>`;
  }

  function renderAvailabilityForm(state) {
    const existing = state.availabilities.find((item) => item.id === state.editingAvailabilityId);
    const item = existing || {
      id: "", title: "Society · Sábado à tarde", dateLabel: "Sábado, 29 de agosto", period: "14h às 18h", city: `${state.profile.city}, ${state.profile.state}`,
      radius: "Até 25 km", category: state.profile.category, level: state.profile.level, homeAway: "Mandante ou visitante", notes: "Campo sintético. Podemos dividir a arbitragem."
    };
    return `<div class="screen screen--form">
      ${screenHeader("Radar de Amistosos", existing ? "Editar disponibilidade" : "Quando seu time quer jogar?", "Essas informações serão públicas para clubes compatíveis.")}
      <form class="availability-form" data-form="availability">
        <input type="hidden" name="id" value="${esc(item.id)}">
        <section class="form-card card">
          <div class="form-section-heading"><span>01</span><div><h2>Data e horário</h2><p>Escolha uma janela confortável para organizar a partida.</p></div></div>
          <div class="field-grid field-grid--two">
            <label class="field field--wide"><span>Título da publicação</span><input name="title" maxlength="70" required value="${esc(item.title)}"></label>
            <label class="field"><span>Dia</span><input name="dateLabel" maxlength="60" required value="${esc(item.dateLabel)}"></label>
            <label class="field"><span>Horário</span><select name="period"><option${selected(item.period, "8h às 12h")}>8h às 12h</option><option${selected(item.period, "14h às 18h")}>14h às 18h</option><option${selected(item.period, "19h às 22h")}>19h às 22h</option></select></label>
          </div>
        </section>
        <section class="form-card card">
          <div class="form-section-heading"><span>02</span><div><h2>Onde e contra quem</h2><p>Defina o alcance e o tipo de adversário.</p></div></div>
          <div class="field-grid field-grid--two">
            <label class="field"><span>Cidade-base</span><input name="city" required value="${esc(item.city)}"></label>
            <label class="field"><span>Distância</span><select name="radius"><option${selected(item.radius, "Até 10 km")}>Até 10 km</option><option${selected(item.radius, "Até 25 km")}>Até 25 km</option><option${selected(item.radius, "Até 50 km")}>Até 50 km</option></select></label>
            <label class="field"><span>Categoria</span><select name="category"><option${selected(item.category, "Livre")}>Livre</option><option${selected(item.category, "Veterano")}>Veterano</option><option${selected(item.category, "Sub-20")}>Sub-20</option></select></label>
            <label class="field"><span>Nível desejado</span><select name="level"><option${selected(item.level, "Iniciante")}>Iniciante</option><option${selected(item.level, "Intermediário")}>Intermediário</option><option${selected(item.level, "Competitivo")}>Competitivo</option></select></label>
            <label class="field field--wide"><span>Mando de jogo</span><select name="homeAway"><option${selected(item.homeAway, "Mandante ou visitante")}>Mandante ou visitante</option><option${selected(item.homeAway, "Temos campo")}>Temos campo</option><option${selected(item.homeAway, "Precisamos de campo")}>Precisamos de campo</option></select></label>
            <label class="field field--wide"><span>Observações públicas</span><textarea name="notes" maxlength="220" rows="4">${esc(item.notes)}</textarea><small>Não inclua telefone, endereço exato ou contato pessoal.</small></label>
          </div>
        </section>
        <div class="publish-preview card"><span>${icon("eye")}</span><div><strong>Prévia pública</strong><p>Outros clubes verão data, região aproximada e preferências. O contato continua protegido.</p></div></div>
        <div class="sticky-actions"><div><span>${icon("shield")} Demonstração local</span><p>Nenhum dado real será publicado.</p></div><div>${button("Cancelar", { action: "navigate", target: "availabilities", kind: "ghost" })}${button(existing ? "Salvar alterações" : "Publicar disponibilidade", { type: "submit", trailing: "arrow" })}</div></div>
      </form>
    </div>`;
  }

  function renderStates() {
    const states = [
      ["loading", "Carregamento", "Enquanto os dados são preparados"],
      ["empty", "Lista vazia", "Quando ainda não há publicações"],
      ["success", "Ação concluída", "Confirmação clara e próxima etapa"],
      ["error", "Erro recuperável", "Falha com opção de tentar de novo"],
      ["session-expired", "Sessão expirada", "Pedido seguro para entrar novamente"],
      ["access-denied", "Acesso negado", "Conta sem permissão para o recurso"]
    ];
    return `<div class="screen screen--wide">${screenHeader("Qualidade da experiência", "Estados previstos", "Respostas claras para cada momento do Radar.")}
      <div class="states-grid">${states.map(([target, title, detail]) => `<button class="state-card card" type="button" data-action="navigate" data-target="${target}"><span>${icon(target === "success" ? "check" : target === "loading" ? "more" : target === "access-denied" ? "lock" : "radar")}</span><div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>${icon("arrow")}</button>`).join("")}</div>
    </div>`;
  }

  function renderStateView(view) {
    const content = {
      loading: { tone: "loading", icon: "more", eyebrow: "Só um instante", title: "Preparando o Radar…", text: "Estamos organizando as informações do seu time.", action: "Voltar aos estados", target: "states" },
      empty: { tone: "empty", icon: "calendar", eyebrow: "Tudo pronto para começar", title: "Nenhuma disponibilidade ainda", text: "Publique quando seu time quer jogar para aparecer aos clubes próximos.", action: "Criar disponibilidade", target: "availability-form" },
      success: { tone: "success", icon: "check", eyebrow: "Tudo certo", title: "Disponibilidade publicada", text: "Ela já aparece na lista desta demonstração e pode ser editada ou pausada.", action: "Ver disponibilidades", target: "availabilities" },
      error: { tone: "error", icon: "close", eyebrow: "Não foi possível concluir", title: "O Radar encontrou um problema", text: "Seus dados não foram perdidos. Tente novamente em alguns instantes.", action: "Tentar novamente", target: "states" },
      "session-expired": { tone: "warning", icon: "lock", eyebrow: "Sessão protegida", title: "Sua sessão expirou", text: "Entre novamente para continuar. Nenhuma alteração foi publicada.", action: "Voltar para a demonstração", target: "home" },
      "access-denied": { tone: "denied", icon: "shield", eyebrow: "Acesso restrito", title: "Esta conta não pode usar o Radar", text: "Somente o responsável ativo pelo time pode alterar o perfil e publicar disponibilidades.", action: "Voltar à central", target: "home" }
    }[view];
    return `<div class="screen state-page state-page--${content.tone}">
      <section class="state-page__visual">${icon(content.icon)}${view === "loading" ? '<span class="spinner-ring"></span>' : ""}</section>
      <p class="eyebrow">${esc(content.eyebrow)}</p><h1>${esc(content.title)}</h1><p>${esc(content.text)}</p>
      ${button(content.action, { action: "navigate", target: content.target, trailing: "arrow" })}
      ${view !== "loading" ? button("Ver todos os estados", { action: "navigate", target: "states", kind: "ghost" }) : ""}
    </div>`;
  }

  function renderScreen(state) {
    const screens = {
      home: renderHome,
      eligibility: renderEligibility,
      "profile-manual": renderManualProfile,
      "print-import": renderPrintImport,
      "draft-review": renderDraftReview,
      verification: renderVerification,
      availabilities: renderAvailabilities,
      "availability-form": renderAvailabilityForm,
      states: renderStates
    };
    if (screens[state.view]) return screens[state.view](state);
    return renderStateView(state.view);
  }

  function activeClass(current, views) {
    return views.includes(current) ? " is-active" : "";
  }

  function shell(state, screen) {
    const canGoBack = state.view !== "home";
    return `<div class="demo-banner"><span class="demo-banner__dot"></span><strong>Demonstração local</strong><span>— nenhum dado real</span><button type="button" data-action="reset-demo">Reiniciar</button></div>
      <header class="topbar">
        <div class="topbar__inner">
          <button class="back-button${canGoBack ? "" : " back-button--hidden"}" type="button" data-action="back" aria-label="Voltar">${icon("back")}</button>
          <button class="brand" type="button" data-action="navigate" data-target="home" aria-label="Meu Clube FC — início"><span class="brand__mark">MCF</span><span><strong>MEU CLUBE</strong><small>FUTEBOL DE VERDADE</small></span></button>
          <div class="topbar__actions"><span class="pilot-pill">PILOTO GRATUITO</span>${crest("EN", "team-crest--mini")}</div>
        </div>
      </header>
      <div class="app-layout">
        <aside class="sidebar" aria-label="Navegação do Radar">
          <nav>
            <p>MEU TIME</p>
            <button class="nav-item${activeClass(state.view, ["home"])}" type="button" data-action="navigate" data-target="home">${icon("home")}<span>Central do time</span></button>
            <button class="nav-item${activeClass(state.view, ["eligibility", "profile-manual", "print-import", "draft-review", "verification"])}" type="button" data-action="navigate" data-target="eligibility">${icon("radar")}<span>Radar de Amistosos</span><i>NOVO</i></button>
            <button class="nav-item${activeClass(state.view, ["availabilities", "availability-form"])}" type="button" data-action="navigate" data-target="availabilities">${icon("calendar")}<span>Disponibilidades</span></button>
            <p>DEMONSTRAÇÃO</p>
            <button class="nav-item${activeClass(state.view, ["states", "loading", "empty", "success", "error", "session-expired", "access-denied"])}" type="button" data-action="navigate" data-target="states">${icon("list")}<span>Estados da tela</span></button>
          </nav>
          <div class="sidebar__safety">${icon("shield")}<p><strong>Ambiente seguro</strong><span>Sem API e sem dados reais</span></p></div>
        </aside>
        <main class="main" id="radar-main" tabindex="-1">${screen}</main>
      </div>
      <nav class="bottom-nav" aria-label="Navegação principal">
        <button class="${activeClass(state.view, ["home"])}" type="button" data-action="navigate" data-target="home">${icon("home")}<span>Central</span></button>
        <button class="${activeClass(state.view, ["eligibility", "profile-manual", "print-import", "draft-review", "verification"])}" type="button" data-action="navigate" data-target="eligibility">${icon("radar")}<span>Radar</span></button>
        <button class="${activeClass(state.view, ["availabilities", "availability-form"])}" type="button" data-action="navigate" data-target="availabilities">${icon("calendar")}<span>Publicações</span></button>
        <button class="${activeClass(state.view, ["states", "loading", "empty", "success", "error", "session-expired", "access-denied"])}" type="button" data-action="navigate" data-target="states">${icon("list")}<span>Estados</span></button>
      </nav>
      ${state.toast ? `<div class="toast toast--${esc(state.toast.tone)}" role="status">${icon(state.toast.tone === "success" ? "check" : "radar")}<span>${esc(state.toast.message)}</span><button type="button" data-action="dismiss-toast" aria-label="Fechar aviso">${icon("close")}</button></div>` : ""}
      ${state.busy ? `<div class="busy-overlay" role="status" aria-live="polite"><span class="loader"></span><strong>${esc(state.busyLabel)}</strong><small>Isso acontece apenas nesta demonstração.</small></div>` : ""}`;
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function create(root, store, router) {
    let currentState = store.getState();

    function render(state) {
      currentState = state;
      root.innerHTML = shell(state, renderScreen(state));
      document.title = `${root.querySelector("h1")?.textContent || "Radar de Amistosos"} — demonstração local`;
    }

    store.subscribe(render);

    root.addEventListener("click", async (event) => {
      const control = event.target.closest("[data-action]");
      if (!control || control.disabled) return;
      const action = control.dataset.action;
      const target = control.dataset.target;
      const id = control.dataset.id;

      if (action === "navigate") router.navigate(target);
      if (action === "back") router.back();
      if (action === "reset-demo") { store.reset(); router.navigate("home", { replace: true }); }
      if (action === "dismiss-toast") store.dismissToast();
      if (action === "preview-team") store.notify ? store.notify("Perfil público aberto na demonstração.", "info") : null;
      if (action === "demo-print") store.setImportedPreview("demo");
      if (action === "create-draft") { await store.prepareDraft(); router.navigate("draft-review"); }
      if (action === "start-verification") await store.startVerification();
      if (action === "confirm-verification") await store.confirmVerification();
      if (action === "approve-verification") await store.approveVerification();
      if (action === "new-availability") { store.beginAvailabilityEdit(null); router.navigate("availability-form"); }
      if (action === "edit-availability") { store.beginAvailabilityEdit(id); router.navigate("availability-form"); }
      if (action === "toggle-availability") store.toggleAvailability(id);
      if (action === "cancel-availability" && window.confirm("Cancelar esta disponibilidade demonstrativa?")) store.cancelAvailability(id);
      if (action === "copy-code") {
        try { await navigator.clipboard.writeText("MCF-4827"); } catch (_error) { /* A seleção manual continua disponível. */ }
        control.classList.add("is-copied");
        const live = document.getElementById("radar-live");
        if (live) live.textContent = "Código demonstrativo copiado.";
      }
      if (["notify-settings", "notify-opponents", "notify-opponent", "availability-details"].includes(action)) {
        const live = document.getElementById("radar-live");
        if (live) live.textContent = "Ação demonstrativa concluída.";
        control.classList.add("is-touched");
        window.setTimeout(() => control.classList.remove("is-touched"), 500);
      }
    });

    root.addEventListener("change", (event) => {
      const input = event.target.closest('[data-input="profile-print"]');
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) {
        window.alert("Escolha uma imagem PNG, JPG ou WebP de até 8 MB.");
        input.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => store.setImportedPreview(String(reader.result));
      reader.readAsDataURL(file);
    });

    root.addEventListener("submit", async (event) => {
      const form = event.target;
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = formValues(form);
      if (form.dataset.form === "manual-profile") {
        await store.saveManualProfile(values);
        router.navigate("verification");
      }
      if (form.dataset.form === "draft-review") {
        await store.acceptDraft(values);
        router.navigate("verification");
      }
      if (form.dataset.form === "availability") {
        await store.saveAvailability(values);
        router.navigate("availabilities");
      }
    });

    return { render: () => render(currentState) };
  }

  window.RadarUI = { create };
})();
