# Scaner-Snipe-it

Aplicação simples para consultar ativos do Snipe-IT, mover PA e fazer checkout de itens.

## Configuração

Defina as variáveis de ambiente antes de rodar:

- `SNIPE_URL` (exemplo: `https://meu-snipe-it/api/v1`)
- `SNIPE_API_KEY`
- `PORT` (opcional, padrão `3000`)

## Executar

```bash
cd src
npm install express axios cors
SNIPE_URL="https://meu-snipe-it/api/v1" SNIPE_API_KEY="seu_token" node server.js
```

Depois acesse:

- `http://localhost:3000/index.html` (scanner/movimentação)
- `http://localhost:3000/ativo.html?id=123` (detalhes do ativo)
- `http://localhost:3000/homeoffice.html` (checkout de kit)
