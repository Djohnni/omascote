(function () {
  "use strict";

  window.RadarDemoData = {
    storageKey: "meu-clube-fc:radar-demo:v1",
    profile: {
      teamName: "Estrela do Norte FC",
      shortName: "Estrela do Norte",
      city: "Joinville",
      state: "SC",
      instagram: "@estreladonortefc",
      modality: "Futebol society",
      category: "Livre",
      level: "Intermediário",
      publicProfile: true,
      termsAccepted: true,
      crestInitials: "EN",
      summary: "Time de amigos criado em 2018, competitivo dentro de campo e parceiro fora dele."
    },
    draft: {
      teamName: "Estrela do Norte FC",
      instagram: "@estreladonortefc",
      city: "Joinville",
      state: "SC",
      modality: "Futebol society",
      category: "Livre",
      level: "Intermediário",
      summary: "Time de amigos criado em 2018, competitivo dentro de campo e parceiro fora dele.",
      confidence: 88
    },
    checklist: [
      { key: "publicProfile", label: "Perfil público do time", detail: "Visível para outros clubes", ready: true },
      { key: "city", label: "Cidade e estado", detail: "Joinville, SC", ready: true },
      { key: "instagram", label: "Instagram do time", detail: "Falta comprovar que você controla o perfil", ready: false },
      { key: "termsAccepted", label: "Termos do Radar", detail: "Aceitos nesta demonstração", ready: true }
    ],
    suggestedOpponents: [
      { name: "Vila Nova Society", initials: "VN", distance: "6 km", level: "Intermediário", conduct: "Boa conduta", verified: true },
      { name: "Atlético Zona Sul", initials: "AZ", distance: "13 km", level: "Intermediário", conduct: "Novo no Radar", verified: false },
      { name: "União do Norte FC", initials: "UN", distance: "21 km", level: "Competitivo", conduct: "Boa conduta", verified: true }
    ],
    availabilities: [
      {
        id: "demo-disponibilidade-1",
        title: "Society · Quinta à noite",
        status: "active",
        dateLabel: "Quinta, 27 de agosto",
        period: "19h às 22h",
        city: "Joinville, SC",
        radius: "Até 25 km",
        category: "Livre",
        level: "Intermediário",
        homeAway: "Mandante ou visitante",
        notes: "Campo sintético. Dividimos a arbitragem."
      }
    ]
  };
})();
