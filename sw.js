const OMASCOTE_SW_VERSION = "omascote-sw-v6-location";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Service worker mínimo para habilitar instalação PWA.
// Não intercepta nem cacheia app.html, API, login, pedidos, pagamentos, uploads ou pipeline.
