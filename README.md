# Scaner-Snipe-it

Aplicação para consultar ativos no Snipe-IT/SIpe com autenticação segura baseada em arquivo (`users.json`) e variáveis de ambiente (`.env`).

## Configuração

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Edite o `.env`:

- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `SIPE_API_BASE`
- `SNIPE_URL`
- `SNIPE_API_KEY`

3. Instale dependências:

```bash
cd src
npm install
```

## Estrutura

- `src/data/users.json`: usuários com `matricula`, `password_hash` (bcrypt) e `api_key_encrypted` (AES-256-GCM).
- `src/routes/authRoutes.js`: login e alteração de senha.
- `src/middleware/authMiddleware.js`: proteção por JWT.
- `src/routes/sipeRoutes.js`: integração privada com SIpe IT usando API key descriptografada somente no backend.

## Fluxo de autenticação

- `POST /api/auth/login`
  - valida matrícula + senha
  - aplica rate limit e bloqueio por tentativas inválidas
  - gera JWT com expiração (`JWT_EXPIRES_IN`)
- `POST /api/auth/register`
  - cria usuário novo com matrícula única
  - valida senha forte no backend
  - recebe a chave pessoal da API e persiste criptografada no `users.json`
  - persiste hash bcrypt no `users.json`
- `POST /api/auth/change-password`
  - rota protegida por JWT
  - valida senha atual
  - gera novo hash bcrypt e grava no `users.json`
- logs de autenticação em `src/data/auth.log`

## Frontend

- `/login.html`
- `/register.html`
- `/dashboard.html`
- `/change-password.html`

O JWT é armazenado em `localStorage` no frontend e enviado no header `Authorization: Bearer <token>`.

## Executar

```bash
cd src
npm run check
npm test
npm start
```


## Rotas SIpe

- `GET /api/sipe/hardware/:id` (rota recomendada)
- `GET /api/sipe/asset/:id` (alias de compatibilidade)
