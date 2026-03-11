# Scaner-Snipe-it (Cordova)

Aplicação web adaptada para rodar como app Android com **Apache Cordova**, incluindo suporte a operação **offline com buffer local** e sincronização automática.

## Estrutura

O frontend para Cordova está em `www/`:

- `www/index.html`
- `www/ativo.html`
- `www/homeoffice.html`
- `www/js/config.js`
- `www/js/api-client.js`
- `www/js/offline-queue.js`

> O arquivo `server.js` permanece no repositório apenas como legado de desenvolvimento web anterior. No fluxo Cordova, o app consome diretamente a API remota.

## Configuração da API

Edite `www/js/config.js`:

- `API_BASE_URL`: URL da API do Snipe-IT (ex.: `https://meu-snipe-it/api/v1`)
- `API_TOKEN`: token Bearer da API
- `PA_FIELD_KEY`: chave do campo customizado de PA

## Comportamento offline

O app implementa:

- `salvarOffline(dados)`: salva requisições em fila no `localStorage`.
- `sincronizarDados()`: envia fila pendente quando a internet retorna.
- `enviarParaAPI(dados)`: executa cada item da fila contra a API.

Regras:

- **Com internet**: envia direto para API.
- **Sem internet**: salva localmente.
- **Quando voltar internet**: sincroniza automaticamente no evento `online` e ao retomar app.

## Build com Cordova (Android)

```bash
npm install -g cordova
cordova create scanner-snipeit br.com.exemplo.scanner "Scanner Snipe-IT"
cd scanner-snipeit
cordova platform add android
```

Copie o conteúdo desta pasta `www/` para a pasta `www/` do projeto Cordova.

Opcional para status de rede mais confiável:

```bash
cordova plugin add cordova-plugin-network-information
```

Depois compile:

```bash
cordova build android
```
