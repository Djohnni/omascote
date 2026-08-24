(function () {
  "use strict";

  const source = window.RadarDemoData;
  const listeners = new Set();

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultOpponentFilters() {
    return {
      modality: "Todas",
      category: "Todas",
      level: "Qualquer",
      day: "Qualquer",
      period: "Qualquer",
      radiusKm: 25,
      venue: "Casa ou fora"
    };
  }

  function defaultState() {
    return {
      view: "home",
      busy: false,
      busyLabel: "",
      toast: null,
      profile: copy(source.profile),
      draft: copy(source.draft),
      profileReady: false,
      importedPreview: null,
      verification: {
        status: "unverified",
        challenge: null,
        requestedAt: null,
        approvedAt: null
      },
      availabilities: copy(source.availabilities),
      editingAvailabilityId: null,
      opponentFilters: defaultOpponentFilters(),
      opponentVisibleLimit: 6,
      selectedOpponentSlug: null,
      opponentListScrollY: 0,
      sequence: 2
    };
  }

  function loadState() {
    const fresh = defaultState();
    try {
      const saved = window.localStorage.getItem(source.storageKey);
      if (!saved) return fresh;
      const parsed = JSON.parse(saved);
      return {
        ...fresh,
        profile: { ...fresh.profile, ...(parsed.profile || {}) },
        draft: { ...fresh.draft, ...(parsed.draft || {}) },
        profileReady: Boolean(parsed.profileReady),
        verification: { ...fresh.verification, ...(parsed.verification || {}), challenge: null },
        availabilities: Array.isArray(parsed.availabilities) ? parsed.availabilities : fresh.availabilities,
        opponentFilters: { ...fresh.opponentFilters, ...(parsed.opponentFilters || {}) },
        sequence: Number.isInteger(parsed.sequence) ? parsed.sequence : fresh.sequence
      };
    } catch (_error) {
      return fresh;
    }
  }

  let state = loadState();

  function persist() {
    const safeState = {
      profile: state.profile,
      draft: state.draft,
      profileReady: state.profileReady,
      verification: { ...state.verification, challenge: null },
      availabilities: state.availabilities,
      opponentFilters: state.opponentFilters,
      sequence: state.sequence
    };
    try {
      window.localStorage.setItem(source.storageKey, JSON.stringify(safeState));
    } catch (_error) {
      // A demonstração segue funcional em memória quando o armazenamento está indisponível.
    }
  }

  function emit(options) {
    if (!options || options.persist !== false) persist();
    listeners.forEach((listener) => listener(copy(state)));
  }

  function announce(message) {
    const live = document.getElementById("radar-live");
    if (!live) return;
    live.textContent = "";
    window.setTimeout(() => { live.textContent = message; }, 30);
  }

  function notify(message, tone) {
    state.toast = { message, tone: tone || "success", nonce: Date.now() };
    announce(message);
    emit({ persist: false });
  }

  function setBusy(isBusy, label) {
    state.busy = isBusy;
    state.busyLabel = isBusy ? (label || "Carregando") : "";
    emit({ persist: false });
  }

  function delay(label, work, duration) {
    setBusy(true, label);
    return new Promise((resolve) => {
      window.setTimeout(() => {
        try {
          const result = work();
          emit();
          resolve(result);
        } finally {
          setBusy(false);
        }
      }, duration || 520);
    });
  }

  const store = {
    subscribe(listener) {
      listeners.add(listener);
      listener(copy(state));
      return () => listeners.delete(listener);
    },

    getState() {
      return copy(state);
    },

    setView(view) {
      state.view = view;
      emit({ persist: false });
    },

    reset() {
      state = defaultState();
      persist();
      emit({ persist: false });
      notify("Demonstração reiniciada.", "info");
    },

    dismissToast() {
      state.toast = null;
      emit({ persist: false });
    },

    notify(message, tone) {
      notify(message, tone);
    },

    saveManualProfile(values) {
      return delay("Salvando o perfil", () => {
        state.profile = { ...state.profile, ...values, publicProfile: true, termsAccepted: true };
        state.profileReady = true;
        state.draft = { ...state.draft, ...values };
        notify("Perfil do time salvo para a demonstração.");
      });
    },

    setImportedPreview(dataUrl) {
      state.importedPreview = dataUrl || "demo";
      emit({ persist: false });
    },

    prepareDraft() {
      return delay("A IA está preparando um rascunho fictício", () => {
        state.draft = { ...copy(source.draft), summary: state.profile.summary };
      }, 750);
    },

    acceptDraft(values) {
      return delay("Aplicando o rascunho", () => {
        state.draft = { ...state.draft, ...values };
        state.profile = {
          ...state.profile,
          teamName: values.teamName,
          instagram: values.instagram,
          city: values.city,
          state: values.state,
          modality: values.modality,
          category: values.category,
          level: values.level,
          summary: values.summary,
          publicProfile: true,
          termsAccepted: true
        };
        state.profileReady = true;
        notify("Rascunho revisado. Nenhum dado foi publicado.");
      }, 620);
    },

    startVerification() {
      return delay("Criando desafio demonstrativo", () => {
        state.verification = {
          status: "challenge",
          challenge: "MCF-4827",
          requestedAt: new Date().toISOString(),
          approvedAt: null
        };
        notify("Código demonstrativo criado.", "info");
      });
    },

    confirmVerification() {
      return delay("Enviando para revisão", () => {
        state.verification = {
          ...state.verification,
          status: "pending",
          challenge: null
        };
        notify("Comprovação enviada para revisão.");
      }, 650);
    },

    approveVerification() {
      return delay("Simulando revisão segura", () => {
        state.verification = {
          ...state.verification,
          status: "verified",
          challenge: null,
          approvedAt: new Date().toISOString()
        };
        notify("Instagram aprovado nesta demonstração.");
      }, 700);
    },

    beginAvailabilityEdit(id) {
      state.editingAvailabilityId = id || null;
      emit({ persist: false });
    },

    saveAvailability(values) {
      return delay(values.id ? "Atualizando disponibilidade" : "Publicando disponibilidade", () => {
        if (values.id) {
          state.availabilities = state.availabilities.map((item) => item.id === values.id
            ? { ...item, ...values, status: item.status === "cancelled" ? "active" : item.status }
            : item);
          notify("Disponibilidade atualizada.");
        } else {
          const created = {
            ...values,
            id: `demo-disponibilidade-${state.sequence++}`,
            status: "active"
          };
          state.availabilities = [created, ...state.availabilities];
          notify("Disponibilidade publicada na lista.");
        }
        state.editingAvailabilityId = null;
      }, 580);
    },

    toggleAvailability(id) {
      const item = state.availabilities.find((entry) => entry.id === id);
      if (!item || item.status === "cancelled") return;
      item.status = item.status === "paused" ? "active" : "paused";
      emit();
      notify(item.status === "paused" ? "Disponibilidade pausada." : "Disponibilidade reativada.", "info");
    },

    cancelAvailability(id) {
      const item = state.availabilities.find((entry) => entry.id === id);
      if (!item) return;
      item.status = "cancelled";
      emit();
      notify("Disponibilidade cancelada.", "info");
    },

    applyOpponentFilters(values) {
      const allowed = {
        modality: new Set(["Todas", "Society", "Campo", "Futsal"]),
        category: new Set(["Todas", "Livre", "Veterano", "Sub-20"]),
        level: new Set(["Qualquer", "Recreativo", "Intermediário", "Competitivo"]),
        day: new Set(["Qualquer", "Sábado", "Domingo", "Próximos 30 dias"]),
        period: new Set(["Qualquer", "Manhã", "Tarde", "Noite"]),
        venue: new Set(["Casa ou fora", "Mandante", "Visitante"])
      };
      const next = defaultOpponentFilters();
      for (const key of Object.keys(allowed)) {
        if (allowed[key].has(values?.[key])) next[key] = values[key];
      }
      const radius = Number(values?.radiusKm);
      next.radiusKm = Number.isFinite(radius) ? Math.max(5, Math.min(25, Math.round(radius))) : 25;
      state.opponentFilters = next;
      state.opponentVisibleLimit = 6;
      state.opponentListScrollY = 0;
      emit();
      announce("Filtros aplicados à lista de times.");
    },

    clearOpponentFilters() {
      state.opponentFilters = defaultOpponentFilters();
      state.opponentVisibleLimit = 6;
      state.opponentListScrollY = 0;
      emit();
      announce("Filtros removidos.");
    },

    selectOpponent(slug, scrollY) {
      const exists = source.nearbyTeams.some((team) => team.slug === slug);
      state.selectedOpponentSlug = exists ? slug : null;
      state.opponentListScrollY = Math.max(0, Number(scrollY) || 0);
      emit({ persist: false });
    },

    rememberOpponentListPosition(scrollY) {
      state.opponentListScrollY = Math.max(0, Number(scrollY) || 0);
    },

    loadMoreOpponents() {
      return delay("Buscando mais times compatíveis", () => {
        state.opponentVisibleLimit += 4;
        announce("Mais times adicionados à lista.");
      }, 420);
    }
  };

  window.RadarCore = { store, copy };
})();
