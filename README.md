# Snipe-IT Mobile

Aplicacao web simples para registrar movimentacoes de TI pelo celular, com captura de foto no momento do cadastro.

## Fluxos

- Entrega de material para pessoa ou local.
- Criacao opcional de local.
- Emprestimo com data de devolucao prevista.
- Recebimento de mercadoria, como toner e itens de TI.
- Recebimento/auditoria de material devolvido.
- Leitura de QR Code/codigo da etiqueta pelo celular para localizar ativos e itens de estoque.

## Como rodar

```powershell
cd C:\Git\snipe-it-mobile
node server.js
```

Depois abra `http://localhost:3010`.

Login inicial:

```text
usuario: root
senha: admin
```

Troque a senha no primeiro acesso.

Para testar no celular, o computador e o celular precisam estar na mesma rede. Use o IP do computador, por exemplo `http://192.168.0.10:3010`.

## Configuracao Snipe-IT

O app ja vem apontando para:

```env
SNIPEIT_URL=https://equipamentos.censupeg.com.br
```

Para sincronizar com o Snipe-IT da CENSUPEG, abra o app local e toque em `API`. Cole o token de API gerado no Snipe-IT e clique em `Salvar configuracao`, depois em `Testar`.

Tambem da para editar o `.env` manualmente:

```env
SNIPEIT_URL=https://seu-snipe-it
SNIPEIT_TOKEN=token_api
```

Cada usuario do app salva seu proprio token de API. Sem token, o app opera em modo local e salva os registros em `data/events.json`, com fotos em `uploads/`.

## Administracao

O usuario `root` acessa o painel `Admin`, onde pode:

- Ver dashboard de registros, erros e e-mails pendentes.
- Ver alerta de emprestimos atrasados.
- Criar usuarios operadores ou administradores.
- Editar termo de entrega e termo de devolucao apenas pelo painel administrador.

## E-mail

A configuracao SMTP fica no `.env`, nao no painel:

```env
SMTP_HOST=smtp.seudominio.com.br
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario_smtp
SMTP_PASS=senha_smtp
SMTP_FROM=ti@seudominio.com.br
```

Depois de alterar o `.env`, reinicie o servidor. Se o SMTP estiver configurado e o e-mail do receptor vier do Snipe-IT, o termo assinado e enviado automaticamente.

Os termos aceitam variaveis simples:

- `{{asset}}`
- `{{date}}`
- `{{receiver}}`
- `{{email}}`
- `{{operator}}`
- `{{note}}`

Na entrega, emprestimo e devolucao, o app exige assinatura na tela. O termo assinado e salvo em `data/terms/` e a assinatura em `uploads/`. Operadores usam sempre os termos salvos pelo administrador.

## Atrasos

Emprestimos com `returnDate` anterior ao dia atual aparecem como atraso na tela principal e no dashboard admin. A devolucao pelo fluxo `Devolucao` remove o item da lista de atrasos quando o mesmo ativo/patrimonio e registrado.

## Leitor de etiqueta

Nos campos de ativo e estoque, use `Ler QR da etiqueta`. O app aceita:

- URL do Snipe-IT como `https://equipamentos.censupeg.com.br/hardware/3109`
- caminho do Snipe-IT como `/hardware/3109`
- patrimonio puro como `CENSUN419`
- textos como `asset_tag=CENSUN419`
- codigos numericos, preenchendo o ID do item/ativo

No celular, a camera precisa de `HTTPS` ou `localhost`. Se o app for aberto por IP em `http`, o navegador bloqueia a camera e o app mostra um campo para digitar ou colar o codigo manualmente.

## HTTPS direto no Node

Para usar a camera no celular sem Nginx, gere um certificado local e configure:

```env
HTTPS=true
SSL_CERT=/opt/certs/snipe-mobile/snipe-mobile.crt
SSL_KEY=/opt/certs/snipe-mobile/snipe-mobile.key
```

Depois acesse:

```text
https://192.168.0.3:3010
```

O arquivo da autoridade local (`localCA.crt`) precisa ser instalado nos celulares como certificado de CA confiavel.

## Banco de dados

Por padrao, a persistencia local fica em JSON para facilitar o uso imediato:

- `data/users.json`
- `data/settings.json`
- `data/events.json`

Para servidor AlmaLinux com MariaDB/MySQL e phpMyAdmin, configure:

```env
DB_CLIENT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=snipe_mobile
DB_USER=snipe_mobile
DB_PASSWORD=senha_segura
```

Com `DB_CLIENT=mysql`, o app usa as tabelas `app_users`, `app_events` e `app_settings`. Veja o guia completo em `deploy/ALMALINUX.md`.

## Integracao implementada

- Busca ativos em `/api/v1/hardware`.
- Busca pessoas em `/api/v1/users`.
- Busca locais em `/api/v1/locations`.
- Recebimento de toner/consumiveis em `/api/v1/consumables`.
- Recebimento de perifericos em `/api/v1/accessories`.
- Criacao de ativo em `/api/v1/hardware`.
- Resolve ativo por ID ou patrimonio usando `/api/v1/hardware/{id}` e `/api/v1/hardware/bytag/{asset_tag}`.
- Entrega e emprestimo usam `/api/v1/hardware/{id}/checkout`.
- Devolucao usa `/api/v1/hardware/{id}/checkin`.
- Auditoria usa `/api/v1/hardware/audit`.
- Foto do celular e anexada ao ativo usando `/api/v1/hardware/{id}/files`.
- Recebimento de estoque busca o saldo atual e atualiza `qty` para consumiveis, acessorios ou componentes.

## Presets CENSUPEG

Status identificados no ambiente:

- `2` Pronto para implementar
- `25` Em Uso
- `20` No estoque
- `21` Auditoria
- `16` Manutencao Interna
- `9` Manutencao Terceirizada
- `24` Aguardando Retirada
- `4` Aguardando Recebimento
- `3` Arquivado
- `19` Descarte
- `23` Uso da TI
- `1` Pendente

Por padrao, saidas usam `Em Uso` e retornos usam `Pronto para implementar`, mas a tela permite escolher outro status.

## Observacoes

O Snipe-IT tem diferencas entre versoes e configuracoes. Este primeiro corte centraliza a integracao no `server.js`, para ajustar facilmente endpoints e campos depois de validar com o seu ambiente real.
