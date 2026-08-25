# Radar real no Meu Clube FC

O modo real é iniciado somente pelo botão **Encontrar amistoso** dentro do perfil autenticado. O botão começa oculto e aparece apenas quando `GET /me/time/radar/elegibilidade` responde com sucesso. Parâmetros de URL não ativam o Radar.

O demonstrador continua separado em `radar-amistosos/demo.html?demo=1`. Ele usa dados fictícios, bloqueia rede pela CSP e exibe “Demonstração local”.

## Configuração da API

O `app.html` usa a meta `omascote-api-base`, cujo valor publicado permanece `https://api.omascote.com.br`. Não existe `localhost` fixo no código de produção.

Para a prévia real local, execute o servidor local com:

- `OMASCOTE_LOCAL_API_BASE`: origem HTTP local da API.
- `RADAR_LOCAL_PREVIEW_PORT`: porta opcional da prévia.

O servidor de prévia substitui a meta apenas na resposta em memória e marca o ambiente como `local-real`; ele não altera o arquivo publicado.

## Contratos

`radar-api.js` centraliza autenticação Bearer, `Idempotency-Key`, `ETag`/`If-Match`, cursores, `Cache-Control: no-store`, tempo limite e erros públicos. O modo real não persiste dados do Radar no `localStorage`; somente reutiliza `omascote_token`, que já pertence à autenticação existente do site.

Os eventos `radar:api-trace` contêm somente método, caminho, status, ETag e duração. Token, corpo, contato e descrição privada nunca entram na prova.

## Verificação local

Execute `node --test radar-amistosos/test-radar-api.js`. Depois abra `app.html` pelo servidor de prévia, entre com uma conta local e abra o perfil. O selo `LOCAL REAL · dados da API` diferencia esta integração do demonstrador.
