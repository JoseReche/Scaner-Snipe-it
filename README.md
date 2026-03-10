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
npm run check
npm start
```

Depois acesse:

- `http://localhost:3000/index.html` (scanner/movimentação)
- `http://localhost:3000/ativo.html?id=123` (detalhes do ativo)
- `http://localhost:3000/homeoffice.html` (checkout de kit)


## Solução de erro de sintaxe

Se aparecer erro como `SyntaxError: Unexpected token`) ao iniciar, execute:

```bash
cd src
npm run check
```

Isso valida o `server.js` antes de subir o servidor e ajuda a identificar rapidamente arquivo quebrado por conflito de merge.

## App mobile em Flutter

Foi adicionado um app Flutter em `mobile_app/` com três fluxos principais:

- Consulta de ativo por ID (`GET /asset/:id`)
- Movimentação de PA (`POST /move`)
- Checkout de ativo para usuário (`POST /checkout`)

### Como executar o app Flutter

```bash
cd mobile_app
flutter pub get
flutter run
```

> No Android Emulator, mantenha a URL padrão `http://10.0.2.2:3000` para acessar a API local.
