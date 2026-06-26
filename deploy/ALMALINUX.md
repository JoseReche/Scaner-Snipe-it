# Deploy em AlmaLinux com MariaDB e phpMyAdmin

Guia para publicar o Snipe-IT Mobile em um servidor AlmaLinux usando MariaDB/MySQL administrado pelo phpMyAdmin.

## 1. Pacotes base

```bash
sudo dnf update -y
sudo dnf install -y git nginx mariadb-server policycoreutils-python-utils
sudo systemctl enable --now mariadb nginx
```

Instale Node.js 20:

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```

## 2. Banco de dados

Proteja o MariaDB:

```bash
sudo mysql_secure_installation
```

Crie banco e usuario:

```bash
sudo mysql < /opt/snipe-it-mobile/deploy/schema.sql
```

Se preferir fazer pelo phpMyAdmin, importe `deploy/schema.sql` e troque a senha `troque_esta_senha`.

## 3. phpMyAdmin

No AlmaLinux, o phpMyAdmin costuma vir via EPEL/Remi:

```bash
sudo dnf install -y epel-release
sudo dnf install -y php php-fpm php-mysqli php-json php-mbstring php-zip phpmyadmin
sudo systemctl enable --now php-fpm
```

Configure o Nginx para publicar o phpMyAdmin somente em rede confiavel ou protegido por VPN. Evite deixar `/phpmyadmin` aberto para a internet.

## 4. Aplicacao

Crie usuario de sistema:

```bash
sudo useradd --system --home /opt/snipe-it-mobile --shell /sbin/nologin snipe-mobile
```

Copie o projeto para `/opt/snipe-it-mobile`:

```bash
sudo mkdir -p /opt/snipe-it-mobile
sudo rsync -a --delete ./ /opt/snipe-it-mobile/
sudo chown -R snipe-mobile:snipe-mobile /opt/snipe-it-mobile
cd /opt/snipe-it-mobile
sudo -u snipe-mobile npm ci --omit=dev
```

Crie o `.env`:

```bash
sudo -u snipe-mobile cp .env.example .env
sudo -u snipe-mobile nano .env
```

Configuracao minima:

```env
PORT=3010
SNIPEIT_URL=https://equipamentos.censupeg.com.br

DB_CLIENT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=snipe_mobile
DB_USER=snipe_mobile
DB_PASSWORD=troque_esta_senha

SMTP_HOST=smtp.seudominio.com.br
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario_smtp
SMTP_PASS=senha_smtp
SMTP_FROM=ti@seudominio.com.br
```

Quando `DB_CLIENT=mysql`, o app usa as tabelas `app_users`, `app_events` e `app_settings`. Se elas estiverem vazias, o app migra automaticamente os JSON existentes.

## 5. systemd

```bash
sudo cp /opt/snipe-it-mobile/deploy/snipe-it-mobile.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now snipe-it-mobile
sudo systemctl status snipe-it-mobile
```

Logs:

```bash
sudo journalctl -u snipe-it-mobile -f
```

## 6. Nginx como proxy

Exemplo `/etc/nginx/conf.d/snipe-it-mobile.conf`:

```nginx
server {
    listen 80;
    server_name mobile-equipamentos.seudominio.com.br;

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

Teste e recarregue:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Firewall:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 7. HTTPS

Para camera no celular, use HTTPS. Com Certbot:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mobile-equipamentos.seudominio.com.br
```

## 8. Primeiro acesso

Login inicial:

```text
usuario: root
senha: admin
```

Troque a senha no primeiro acesso. Depois, cada usuario entra no painel `API` e grava seu proprio token do Snipe-IT.

## 9. Backup

Banco:

```bash
mysqldump -u snipe_mobile -p snipe_mobile > snipe_mobile-$(date +%F).sql
```

Arquivos assinados, fotos e termos:

```bash
tar -czf snipe-mobile-files-$(date +%F).tar.gz /opt/snipe-it-mobile/uploads /opt/snipe-it-mobile/data/terms
```
