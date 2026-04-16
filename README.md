# Asset Flow TI + Snipe-IT (Full Stack)

Sistema full stack para operação real de TI no fluxo completo de ativos: solicitação, preparação, retirada, uso, devolução, conferência, manutenção e retorno ao ciclo de implantação.

> Este repositório agora contém **duas aplicações novas**:
>
> - `backend/` (Node.js + Express + PostgreSQL + integração Snipe-IT)
> - `frontend/` (React + Vite)
>
> A pasta legada `src/` foi mantida para compatibilidade histórica.

## 1) Arquitetura

### Backend (`/backend`)
- Express com autenticação JWT para operadores.
- Integração com API do Snipe-IT **somente no backend**.
- Endpoints REST para solicitações, saída, recebimento, conferência, processamento, dashboard e administração.
- Modo mock (`USE_MOCK_DATA=true`) para operação local sem Snipe-IT disponível.
- Upload de anexos com `multer`.
- Logs com `pino` e tratamento centralizado de erros.

### Frontend (`/frontend`)
- React com `react-router-dom`.
- Telas principais:
  - Login
  - Dashboard
  - Solicitações
  - Saída de ativo
  - Recebimento/conferência
  - Processamento interno
  - Histórico de ativo
  - Administração
- Fluxo de operação rápido e responsivo para uso diário de suporte TI.

### Banco de dados (PostgreSQL)
- Migrations em `backend/migrations`.
- Tabelas:
  - `users`
  - `asset_requests`
  - `asset_flow`
  - `asset_movements`
  - `asset_checklists`
  - `asset_incidents`
  - `attachments`
  - `audit_logs`

---

## 2) Setup rápido

## Pré-requisitos
- Node.js 20+
- PostgreSQL 14+

## Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

## Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend padrão: `http://localhost:5173`  
Backend padrão: `http://localhost:4000`

---

## 3) Variáveis de ambiente

### Backend (`backend/.env`)
Consulte `backend/.env.example`:
- `PORT`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `USE_MOCK_DATA`
- `FILES_DIR`
- `SNIPEIT_BASE_URL`
- `SNIPEIT_API_TOKEN`
- `SNIPEIT_TIMEOUT_MS`
- `SNIPEIT_RETRY_ATTEMPTS`

### Frontend (`frontend/.env`)
- `VITE_API_URL`

---

## 4) Migrations e seed

Arquivos:
- `backend/migrations/001_init.sql`
- `backend/migrations/002_seed.sql`

Exemplo (psql):
```bash
psql "$DATABASE_URL" -f backend/migrations/001_init.sql
psql "$DATABASE_URL" -f backend/migrations/002_seed.sql
```

Usuário seed:
- email: `admin@local`
- senha: `Admin@1234`

---

## 5) Endpoints implementados

## Auth
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/seed-operator`

## Solicitações
- `GET /requests`
- `POST /requests`
- `GET /requests/:id`
- `PATCH /requests/:id`
- `POST /requests/:id/assign-asset`
- `POST /requests/:id/prepare`
- `POST /requests/:id/mark-awaiting-pickup`
- `POST /requests/:id/deliver`

## Recebimento
- `GET /receiving/search`
- `POST /receiving/:assetId/checkin`
- `POST /receiving/:assetId/inspection`
- `POST /receiving/:assetId/incident`
- `POST /receiving/:assetId/send-to-maintenance`
- `POST /receiving/:assetId/send-to-stock`

## Processamento
- `POST /processing/:assetId/backup-complete`
- `POST /processing/:assetId/format-complete`
- `POST /processing/:assetId/ready-to-deploy`

## Ativos
- `GET /assets`
- `GET /assets/:id`
- `GET /assets/:id/timeline`
- `GET /assets/:id/movements`

## Admin
- `GET /settings/checklists`
- `POST /settings/checklists`
- `GET /settings/internal-statuses`
- `GET /settings/incident-types`

## Dashboard
- `GET /dashboard/summary`
- `GET /dashboard/pending`
- `GET /dashboard/metrics`

---

## 6) Estratégia de status (interno vs Snipe-IT)

### Status internos do app
- solicitado
- em_triagem
- em_preparacao
- aguardando_retirada
- entregue
- em_uso
- devolvido
- em_conferencia
- estoque
- backup
- formatacao
- pronto_para_implementar
- em_manutencao
- danificado
- descartado

### Status principais no Snipe-IT
- em estoque
- em uso
- em manutenção
- danificado
- pronto para uso

### Regra
O app controla granularidade operacional. O Snipe-IT só recebe estado macro para evitar poluição de fluxo nativo.

---

## 7) Estratégia de sincronização

1. Registrar transição interna e auditoria no app.
2. Tentar sincronização Snipe-IT com retry.
3. Em falha, manter operação interna e registrar erro para reprocessamento.
4. Reprocessar sincronizações pendentes por rotina (job futura).

### Fallback offline/local
Com `USE_MOCK_DATA=true`, o backend simula respostas do Snipe-IT para desenvolvimento e continuidade operacional local.

---

## 8) Sugestões de campos personalizados no Snipe-IT

- `cost_center`
- `department`
- `operational_location`
- `last_internal_flow_status`
- `last_internal_operator`
- `last_internal_inspection_result`

---

## 9) Regras de negócio suportadas

- Não entrega sem solicitante.
- Não entrega sem ativo selecionado.
- NOK exige observação.
- Conferência é pré-requisito para retorno ao estoque.
- Todo passo registra operador/data/hora via movimentações e `audit_logs`.
- Token da API Snipe-IT nunca exposto ao frontend.

---

## 10) Próximos passos para produção

- Persistência completa em PostgreSQL (substituir mockStore por repositórios SQL em todos os fluxos).
- Worker de sincronização assíncrona com DLQ para falhas de integração.
- RBAC avançado por permissões (não apenas role simples).
- Telemetria e alertas para fila de sincronização.
- Upload com storage externo (S3/Blob) e assinatura digital em formato validável.

---

## 11) Legado (`/src`)

A pasta `src/` original foi preservada e não removida para não quebrar fluxos anteriores do repositório.
