# Snipe-IT Auth Gateway (Codespaces)

Sistema de autenticação seguro com arquitetura:

**Frontend → Backend → Snipe-IT API**

O frontend **nunca** chama a API do Snipe-IT diretamente.

## Estrutura

```text
/project
  /backend
    server.js
    routes.js
    middleware.js
  /frontend
    login.html
    dashboard.html
    style.css
    app.js
  /www
    index.html
    ativo.html
    homeoffice.html
    /js
      config.js
      api-client.js
      index.js
      ativo.js
      homeoffice.js
  config.xml
  .env
  package.json
```

No repositório atual, a pasta `/project` corresponde à raiz deste projeto.

## Variáveis de ambiente

Crie um arquivo `.env` na raiz:

```env
SNIPEIT_URL=https://your-snipeit-instance.com
SNIPEIT_API_KEY=YOUR_ADMIN_API_TOKEN
JWT_SECRET=supersecretkey
PORT=3000
LOGIN_PASSWORD_HASH=$2b$10$REPLACE_WITH_BCRYPT_HASH
```

> `LOGIN_PASSWORD_HASH` é usado para validar a senha enviada no `/login` via `bcrypt.compare`.

Gerar hash bcrypt:

```bash
node -e "require('bcrypt').hash('sua_senha_forte', 10).then(console.log)"
```

## Funcionalidades implementadas

- `POST /login`
  - recebe `email` e `password`
  - consulta `GET /api/v1/users?search=email` no Snipe-IT
  - valida existência do usuário + valida senha com bcrypt
  - gera JWT e retorna token + dados básicos do usuário

- Middleware JWT (`backend/middleware.js`)
  - valida token Bearer para rotas protegidas

- `GET /assets` (rota protegida)
  - consulta `GET /api/v1/hardware` usando `SNIPEIT_API_KEY`
  - retorna total e lista simples de ativos

- Frontend simples e responsivo
  - `login.html`: formulário de login e mensagens de erro
  - `dashboard.html`: total de ativos e listagem
  - token salvo no `localStorage`

- App móvel com Cordova
  - interface em `www/`
  - configuração do app em `config.xml`
  - suporte para build Android (APK)

## Executar backend no GitHub Codespaces

```bash
npm install
npm start
```

O servidor sobe por padrão na porta **3000**.

## Gerar APK Android com Cordova

### Pré-requisitos

- Node.js 18+
- Java 17+
- Android SDK com `platform-tools` e uma versão de build-tools instalada
- Variáveis `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`) e `JAVA_HOME` configuradas

### Passos

```bash
npm install
npm run cordova:android:add
npm run cordova:prepare
npm run cordova:android:build
```

APK de debug (gerado pelo Cordova):

```text
platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

### Configuração da API no app móvel

Edite `www/js/config.js` antes do build:

- `API_BASE_URL`: URL da API do Snipe-IT (ex: `https://empresa.snipeit/api/v1`)
- `API_TOKEN`: token da API
- `PA_FIELD_KEY`: chave do campo customizado de PA

## Segurança

- `SNIPEIT_API_KEY` fica **somente** no backend.
- Toda chamada ao Snipe-IT ocorre no backend.
- Rotas protegidas exigem JWT válido.
- Respostas de erro tratadas sem vazar segredos.
