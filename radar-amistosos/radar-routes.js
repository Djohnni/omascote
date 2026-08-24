(function () {
  "use strict";

  const allowedViews = new Set([
    "home", "eligibility", "profile-manual", "print-import", "draft-review", "verification",
    "availabilities", "availability-form", "states", "loading", "empty", "success", "error",
    "session-expired", "access-denied"
  ]);

  function viewFromLocation() {
    const requested = new URL(window.location.href).searchParams.get("view") || "home";
    return allowedViews.has(requested) ? requested : "home";
  }

  function createRouter(store) {
    function buildUrl(view) {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("demo", "1");
      url.searchParams.set("view", allowedViews.has(view) ? view : "home");
      const original = new URL(window.location.href).searchParams;
      if (original.get("omascote_app") === "1") url.searchParams.set("omascote_app", "1");
      if (original.get("capture") === "1") url.searchParams.set("capture", "1");
      return url;
    }

    function navigate(view, options) {
      const safeView = allowedViews.has(view) ? view : "home";
      const method = options && options.replace ? "replaceState" : "pushState";
      store.dismissToast();
      window.history[method]({ radarDemo: true, view: safeView }, "", buildUrl(safeView));
      store.setView(safeView);
      window.scrollTo({ top: 0, behavior: "auto" });
      window.requestAnimationFrame(() => document.getElementById("radar-main")?.focus({ preventScroll: true }));
    }

    function back() {
      if (window.history.state && window.history.state.radarDemo) {
        window.history.back();
      } else {
        navigate("home", { replace: true });
      }
    }

    window.addEventListener("popstate", () => {
      store.setView(viewFromLocation());
      window.scrollTo({ top: 0, behavior: "auto" });
    });

    return { navigate, back };
  }

  function boot() {
    const root = document.getElementById("radar-demo-app");
    if (!root || !window.RadarCore || !window.RadarApi || !window.RadarUI) return;

    const params = new URL(window.location.href).searchParams;
    if (params.get("demo") !== "1") {
      root.innerHTML = '<main class="demo-locked"><span>MCF</span><h1>Demonstração local protegida</h1><p>Abra este checkpoint usando a chave local fornecida pela equipe.</p></main>';
      return;
    }
    const store = window.RadarCore.store;
    if (params.get("reset") === "1") store.reset();
    const initialView = viewFromLocation();
    store.setView(initialView);
    window.history.replaceState({ radarDemo: true, view: initialView }, "", window.location.href);

    const router = createRouter(store);
    const api = window.RadarApi.create({ demoMode: true });
    const ui = window.RadarUI.create(root, store, router);

    window.RadarDemo = Object.freeze({
      mode: "local-demo",
      networkEnabled: false,
      api,
      router,
      store,
      ui
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
