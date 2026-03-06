# Scaner-Snipe-it

Aplicação simples para consultar ativos do Snipe-IT, mover PA e fazer checkout de itens.

## Configuração

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

2. Edite o `.env` com seus dados:

- `SNIPE_URL` (exemplo: `https://meu-snipe-it/api/v1`)
- `SNIPE_API_KEY`
- `PORT` (opcional, padrão `3000`)

> O arquivo `.env` está no `.gitignore` para não vazar senha/chave no Git.

## Executar

```bash
cd src
npm install
npm start
```

Depois acesse:

- `http://localhost:3000/index.html` (scanner/movimentação)
- `http://localhost:3000/ativo.html?id=123` (detalhes do ativo)
- `http://localhost:3000/homeoffice.html` (checkout de kit)
