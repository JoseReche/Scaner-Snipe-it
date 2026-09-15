# Snipe-IT Mobile

Aplicacao web responsiva para registrar operacoes de estoque e ativos do Snipe-IT pelo celular. O sistema foi pensado para uso rapido pela equipe de TI, com leitura de QR Code, captura de fotos e integracao com a API do Snipe-IT.

## Principais recursos

- Entrega de ativos para uma pessoa ou local.
- Emprestimo de ativos com data prevista de devolucao.
- Devolucao e auditoria de ativos.
- Entrega separada de toners, consumiveis e perifericos.
- Recebimento de toners e perifericos com atualizacao de quantidade.
- Criacao de novos itens de estoque e novos ativos.
- Leitura de QR Code ou codigo da etiqueta pelo celular.
- Captura de foto durante o recebimento.
- Geracao de PDF com os dados e a foto do recebimento.
- Registro de item periferico marcado como estragado.
- PDF compacto de descarte anexado aos arquivos do acessorio no Snipe-IT.
- Consulta da localizacao e responsavel atual de um ativo.
- Dashboard administrativo.
- Lista mensal de itens atribuidos, filtros e exportacao CSV.
- Marcacao persistente de itens que ja foram comprados.
- Lista de itens abaixo do estoque minimo configurado no Snipe-IT.
- Persistencia local em JSON ou em MySQL/MariaDB.

## Requisitos

- Node.js 18 ou superior.
- npm.
- Uma instancia do Snipe-IT com token de API.
- MySQL ou MariaDB para instalacao de producao. O sistema tambem funciona com JSON para testes.
- HTTPS para usar a camera em celulares. Em `localhost`, a camera pode funcionar sem HTTPS.

## Instalar localmente

```bash
git clone https://github.com/JoseReche/Scaner-Snipe-it.git
cd Scaner-Snipe-it
npm install
cp .env.example .env
```

Edite o `.env` e informe pelo menos a URL do Snipe-IT:

```env
PORT=3010
SNIPEIT_URL=https://equipamentos.censupeg.com.br
```

Inicie:

```bash
npm start
```

Abra `http://localhost:3010`.

Login inicial:

```text
usuario: root
senha: admin
```

Troque a senha no primeiro acesso. Para acessar pelo celular na mesma rede, use o IP do servidor, por exemplo `http://192.168.0.3:3010`.

## Configurar o Snipe-IT

### Token por usuario

Cada usuario do aplicativo possui seu proprio token de API:

1. Gere um token no perfil do usuario no Snipe-IT.
2. Entre no Snipe-IT Mobile.
3. Abra `API` ou `Configuracao`.
4. Informe a URL do Snipe-IT e cole o token.
5. Clique em `Salvar configuracao` e depois em `Testar conexao`.

O token tambem pode ser informado no `.env`:

```env
SNIPEIT_URL=https://equipamentos.censupeg.com.br
SNIPEIT_TOKEN=seu_token_de_api
```

### Status usados

Os valores padrao podem ser alterados no `.env`:

```env
CENSUPEG_CHECKOUT_STATUS_ID=25
CENSUPEG_CHECKIN_STATUS_ID=2
```

O sistema usa os endpoints de hardware, usuarios, locais, consumiveis e acessorios da API v1 do Snipe-IT.

## Instalacao no AlmaLinux 9

Os passos abaixo consideram o servidor `192.168.0.3` e a instalacao em `/opt/snipe-it-mobile`.

### 1. Pacotes do sistema

```bash
sudo dnf update -y
sudo dnf install -y git nginx mariadb-server policycoreutils-python-utils openssl
sudo systemctl enable --now mariadb nginx
```

Instale Node.js 20:

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node --version
npm --version
```

### 2. Banco MySQL/MariaDB

Proteja o banco:

```bash
sudo mysql_secure_installation
```

Crie o banco e as tabelas usando o arquivo do projeto:

```bash
sudo mysql < deploy/schema.sql
```

O arquivo cria o banco `snipe_mobile`, o usuario `snipe_mobile` e as tabelas `app_users`, `app_events` e `app_settings`.

Altere a senha no `deploy/schema.sql` antes de executar ou altere a senha depois no MariaDB.

### 3. phpMyAdmin

O phpMyAdmin e opcional e serve para administrar o banco visualmente. O aplicativo se conecta diretamente ao MariaDB.

Em instalacoes que usam EPEL/Remi:

```bash
sudo dnf install -y epel-release
sudo dnf install -y php php-fpm php-mysqli php-json php-mbstring php-zip phpmyadmin
sudo systemctl enable --now php-fpm
```

Restrinja o acesso ao phpMyAdmin por firewall, VPN ou rede interna. Nao deixe essa tela exposta publicamente sem protecao.

### 4. Copiar e instalar o sistema

```bash
sudo useradd --system --home /opt/snipe-it-mobile --shell /sbin/nologin snipe-mobile
sudo mkdir -p /opt/snipe-it-mobile
sudo git clone https://github.com/JoseReche/Scaner-Snipe-it.git /opt/snipe-it-mobile
sudo chown -R snipe-mobile:snipe-mobile /opt/snipe-it-mobile
cd /opt/snipe-it-mobile
sudo -u snipe-mobile npm ci --omit=dev
sudo -u snipe-mobile cp .env.example .env
sudo -u snipe-mobile nano .env
```

Configuracao recomendada do `.env`:

```env
PORT=3010
SNIPEIT_URL=https://equipamentos.censupeg.com.br
SNIPEIT_TOKEN=

DB_CLIENT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=snipe_mobile
DB_USER=snipe_mobile
DB_PASSWORD=troque_esta_senha
DB_CONNECTION_LIMIT=10

# Opcional: integracao com Google Sheets
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_TAB_NAME=Saidas
GOOGLE_SERVICE_ACCOUNT_FILE=
```

O arquivo `.env` nao deve ser enviado para o GitHub. Ele ja esta protegido pelo `.gitignore`.

### 5. Executar como servico

```bash
sudo cp deploy/snipe-it-mobile.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now snipe-it-mobile
sudo systemctl status snipe-it-mobile
```

Logs:

```bash
sudo journalctl -u snipe-it-mobile -f
```

Teste localmente no servidor:

```bash
curl http://127.0.0.1:3010
```

### 6. Publicar com Nginx

Crie `/etc/nginx/conf.d/snipe-it-mobile.conf`:

```nginx
server {
    listen 80;
    server_name 192.168.0.3;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Valide e recarregue:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

O acesso ficara disponivel em `http://192.168.0.3`.

### 7. HTTPS para usar a camera

Para producao, prefira um dominio com certificado valido:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mobile.seudominio.com.br
```

Para uma rede interna sem dominio publico, e possivel usar certificado local. Nesse caso, o certificado da autoridade local precisa ser instalado nos celulares. Depois de configurar HTTPS, abra o sistema usando `https://`.

## Como usar

### Entrega de ativo

1. Entre no sistema.
2. Selecione `Entrega de ativo`.
3. Leia o QR Code ou informe a etiqueta do ativo.
4. Escolha a pessoa ou local de destino.
5. Confira a alocacao atual mostrada na tela.
6. Registre a entrega.

### Emprestimo

1. Selecione `Emprestimo`.
2. Localize o ativo.
3. Escolha o usuario ou local.
4. Informe a data prevista de devolucao.
5. Registre o emprestimo.

Os emprestimos atrasados aparecem na tela principal e no Dashboard administrativo.

### Saida de toner ou periferico

1. Selecione `Saida de toner/periferico`.
2. Escolha `Toner/consumivel` ou `Periferico`.
3. Leia o codigo ou pesquise o item.
4. Informe a quantidade.
5. Escolha a pessoa que recebera o item.
6. Se for substituicao de um item estragado, marque a opcao correspondente.
7. Registre a saida.

Quando um periferico e marcado como estragado, o acessorio continua sendo atribuido normalmente. O aplicativo cria uma nova versao compacta do PDF de descarte, preservando o conteudo anterior e adicionando o novo nome e data/hora. O arquivo e anexado nos `Arquivos` do acessorio no Snipe-IT.

### Recebimento

1. Selecione `Recebimento`.
2. Escolha o tipo de item.
3. Selecione um item existente ou crie um novo.
4. Informe a quantidade recebida.
5. Tire a foto do material.
6. Registre o recebimento.

A quantidade e a foto ficam dentro de um PDF. Esse PDF e anexado aos `Arquivos` do item no Snipe-IT.

### Devolucao e auditoria

1. Selecione `Devolucao e auditoria`.
2. Localize o ativo.
3. Registre a devolucao.
4. Informe se a conferencia foi aprovada.
5. Se houver dano, registre a observacao e a foto quando aplicavel.

## Dashboard administrativo

Entre com um usuario com perfil `admin` para acessar:

- resumo de registros, sincronizacoes, erros e atrasos;
- usuarios e seus tokens configurados;
- itens que necessitam reposicao;
- itens atribuidos no mes;
- filtros por item, pessoa, centro de custo e tipo;
- marcacao persistente de item ja comprado;
- exportacao da lista filtrada para CSV;
- limpeza dos lancamentos do mes, mediante confirmacao.

### Itens que necessitam reposicao

O bloco de reposicao consulta toners, consumiveis e perifericos diretamente no Snipe-IT. Ele mostra os itens cuja quantidade atual esta abaixo do campo de estoque minimo configurado no proprio Snipe-IT.

Use `Atualizar` depois de uma compra ou recebimento para consultar os valores mais recentes.

### Planilha Google opcional

Para registrar cada saida de periferico em uma planilha:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=id_da_planilha
GOOGLE_SHEETS_TAB_NAME=Saidas
GOOGLE_SERVICE_ACCOUNT_FILE=/opt/secure/google-service-account.json
```

Compartilhe a planilha com o e-mail da service account. A linha inclui data, quem atribuiu, quantidade, item, valor quando existir, destinatario e centro de custo vindo do Snipe-IT.

## Estrutura do projeto

```text
snipe-it-mobile/
├── server.js                 # servidor HTTP, autenticacao e API
├── package.json              # dependencias e comando de inicializacao
├── .env.example              # exemplo de configuracao
├── public/
│   ├── index.html             # interface web responsiva
│   ├── app.js                 # fluxos, scanner e chamadas da API local
│   └── styles.css             # layout e estilos
├── data/
│   └── terms/                 # PDFs locais gerados pelo sistema
├── uploads/                   # fotos capturadas
└── deploy/
    ├── schema.sql             # banco MySQL/MariaDB
    ├── snipe-it-mobile.service# servico systemd
    └── ALMALINUX.md           # guia complementar de servidor
```

### Camadas principais

- **Interface:** HTML, CSS e JavaScript sem framework, otimizada para celular.
- **Servidor:** Node.js com servidor HTTP nativo.
- **Persistencia:** JSON em desenvolvimento ou MySQL/MariaDB em producao.
- **Integracao externa:** API v1 do Snipe-IT, Google Sheets opcional e leitor QR Code no navegador.
- **Documentos:** `pdf-lib` gera comprovantes e PDFs de descarte; fotos sao incorporadas ao PDF.
- **Seguranca:** usuarios locais, senhas com hash, sessoes e tokens individuais do Snipe-IT.

## Atualizar uma instalacao existente

```bash
cd /opt/snipe-it-mobile
sudo systemctl stop snipe-it-mobile
sudo -u snipe-mobile git pull
sudo -u snipe-mobile npm ci --omit=dev
sudo systemctl start snipe-it-mobile
sudo systemctl status snipe-it-mobile
```

Nao substitua o `.env`, a pasta `uploads/` ou `data/terms/` durante uma atualizacao.

## Backup

Banco de dados:

```bash
mysqldump -u snipe_mobile -p snipe_mobile > snipe_mobile-$(date +%F).sql
```

Fotos e PDFs:

```bash
tar -czf snipe-it-mobile-files-$(date +%F).tar.gz \
  /opt/snipe-it-mobile/uploads \
  /opt/snipe-it-mobile/data/terms
```

Guarde tambem uma copia segura do `.env`, pois ele contem as credenciais do banco e integracoes.

## Solucao de problemas

### `npm: command not found`

Instale o Node.js e confirme:

```bash
node --version
npm --version
```

### Porta 3010 ocupada

```bash
sudo ss -ltnp | grep 3010
sudo systemctl status snipe-it-mobile
```

### O QR Code nao abre a camera

Use HTTPS ou abra por `localhost`. Navegadores normalmente bloqueiam camera em paginas HTTP acessadas por IP.

### O app nao conecta no Snipe-IT

Confira a URL, o token do usuario, o acesso de rede ao Snipe-IT e os logs:

```bash
sudo journalctl -u snipe-it-mobile -n 100 --no-pager
```

### O banco nao conecta

Confira `DB_CLIENT`, `DB_HOST`, `DB_NAME`, `DB_USER` e `DB_PASSWORD` no `.env`. Teste o usuario no MariaDB antes de testar pelo aplicativo.

## Licenca e contribuicoes

Antes de publicar o repositorio, defina a licenca desejada e remova qualquer credencial, token, foto, PDF ou arquivo `.env` do historico do Git.
