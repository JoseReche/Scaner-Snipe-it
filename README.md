# Scaner-Snipe-it (Go)

Aplicação para consultar ativos no Snipe-IT/SIpe com autenticação segura em **Golang**, banco local SQLite (`users.sqlite`) e variáveis de ambiente (`.env`).

## Configuração

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Edite o `.env` com pelo menos:

- `JWT_SECRET`
- `ENCRYPTION_KEY` (16, 24 ou 32 caracteres)
- `SNIPE_URL`

## Executar

```bash
go mod tidy
go run .
```

Servidor padrão: `http://localhost:3000`

## Stack atual

- Backend: `net/http` + `chi`
- Banco local: SQLite (`src/data/users.sqlite`)
- Auth: JWT (`Authorization: Bearer <token>`)
- Senha: `bcrypt`
- API Key pessoal: criptografada com AES-GCM no backend

## Rotas principais

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/change-password` (protegida)

### SIPE/Snipe-IT (protegidas)
- `GET /asset/:id`
- `GET /api/sipe/hardware/:id`
- `GET /api/sipe/asset/:id`
- `GET /move-info?asset=<id>`
- `PATCH /asset/:id`
- `POST /move`
- `GET /options`
- `POST /checkout`
- `POST /home-office/termo` (PDF)

## Frontend

Arquivos estáticos em `src/public` continuam sendo servidos pelo backend Go.
