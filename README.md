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

## Executar no GitHub Codespaces

```bash
npm install
npm start
```

O servidor sobe por padrão na porta **3000**.

## Segurança

- `SNIPEIT_API_KEY` fica **somente** no backend.
- Toda chamada ao Snipe-IT ocorre no backend.
- Rotas protegidas exigem JWT válido.
- Respostas de erro tratadas sem vazar segredos.
