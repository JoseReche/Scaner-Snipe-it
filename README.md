# Scaner-Snipe-it

Aplicação para consultar ativos no Snipe-IT/SIpe com autenticação segura baseada em banco local SQLite (`users.sqlite`) e variáveis de ambiente (`.env`), usando API Key pessoal de cada usuário criptografada no backend.

## Configuração

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Edite o `.env`:

- `JWT_SECRET`
- `SIPE_API_BASE`
- `SNIPE_URL`

3. Instale dependências:

```bash
cd src
npm install
```

## Estrutura

- `src/data/users.sqlite`: banco local SQLite com `matricula`, `password_hash` (bcrypt) e `api_key_encrypted` (AES-256-GCM).
- `src/routes/authRoutes.js`: login e alteração de senha.
- `src/middleware/authMiddleware.js`: proteção por JWT.
- `src/routes/sipeRoutes.js`: integração privada com SIpe IT usando API key pessoal do usuário no backend.

## Fluxo de autenticação

- `POST /api/auth/login`
  - valida matrícula + senha
  - aplica rate limit e bloqueio por tentativas inválidas
  - gera JWT com expiração (`JWT_EXPIRES_IN`, padrão `3h`)
- `POST /api/auth/register`
  - cria usuário novo com matrícula única
  - valida senha forte no backend
  - recebe a chave pessoal da API, criptografa no backend e persiste no SQLite (`users.sqlite`)
  - persiste hash bcrypt no SQLite (`users.sqlite`)
- `POST /api/auth/change-password`
  - rota protegida por JWT
  - valida senha atual
  - gera novo hash bcrypt e grava no SQLite (`users.sqlite`)
- logs de autenticação em `src/data/auth.log`


## Segurança

- API token nunca é salvo em texto puro: é criptografado com AES-256-GCM + chave derivada via scrypt (com salt aleatório por registro).
- Senhas são armazenadas apenas como hash bcrypt.
- O serviço lê/salva apenas os campos mínimos do usuário (`matricula`, `password_hash`, `api_key_encrypted`).
- O armazenamento de usuários é exclusivamente em SQLite (`users.sqlite`), sem persistência em JSON.
- `ENCRYPTION_KEY` precisa ter no mínimo 16 caracteres (recomendado 32+).

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

## Testes automatizados

Os testes são executados com o runner nativo do Node (`node --test`) via `npm test` dentro de `src/`.

Principais cenários cobertos em `src/server.test.js`:

- parsing e mapeamento de custom fields (incluindo fallback para `db_column`)
- montagem de payload de atualização de ativos
- atualização de ativo (`PATCH /asset/:id`)
- consulta de informações de movimentação (`GET /move-info`)
- atualização de PA em campo customizado (`POST /move`)
- fluxo de autenticação (`register`/`login`) com proteção de matrícula duplicada
- propagação amigável de erro `401` quando a API key do usuário é inválida no Snipe-IT


## Rotas SIpe

- `GET /api/sipe/hardware/:id` (rota recomendada)
- `GET /api/sipe/asset/:id` (alias de compatibilidade)
