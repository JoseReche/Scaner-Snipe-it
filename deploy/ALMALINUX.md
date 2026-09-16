# Deploy no AlmaLinux 9 sem Nginx

Este guia usa Node.js para o aplicativo, Apache para o phpMyAdmin e MariaDB para o banco. O aplicativo fica em `http://IP_DO_SERVIDOR:3010` e o phpMyAdmin em `http://IP_DO_SERVIDOR/phpmyadmin`.

## 1. Pacotes

```bash
sudo dnf update -y
sudo dnf install -y git httpd mariadb-server policycoreutils-python-utils openssl
sudo systemctl enable --now mariadb httpd

curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node --version
npm --version
```

## 2. Banco de dados

Proteja o MariaDB:

```bash
sudo mysql_secure_installation
```

Crie o banco:

```bash
sudo mysql < /opt/snipe-it-mobile/deploy/schema.sql
```

Crie o usuario do aplicativo pelo phpMyAdmin ou pelo MariaDB usando a mesma senha definida no `.env`:

```sql
CREATE USER 'snipe_mobile'@'localhost' IDENTIFIED BY 'COLOQUE_A_MESMA_SENHA_DO_ENV';
GRANT ALL PRIVILEGES ON snipe_mobile.* TO 'snipe_mobile'@'localhost';
FLUSH PRIVILEGES;
```

Nao grave a senha real no arquivo SQL ou no GitHub.

## 3. phpMyAdmin pela URL

```bash
sudo dnf install -y epel-release
sudo dnf install -y php php-fpm php-mysqli php-json php-mbstring php-zip phpmyadmin
sudo systemctl enable --now php-fpm httpd
```

O pacote normalmente instala a configuracao em `/etc/httpd/conf.d/phpMyAdmin.conf`. Restrinja o acesso para a rede interna editando o bloco de acesso e mantendo apenas a faixa autorizada, por exemplo:

```apache
<RequireAny>
    Require ip 127.0.0.1
    Require ip 192.168.0.0/24
</RequireAny>
```

Reinicie o Apache:

```bash
sudo systemctl restart httpd
```

Acesse:

```text
http://192.168.0.3/phpmyadmin
```

Nao exponha o phpMyAdmin diretamente na internet. Use firewall, VPN e uma senha forte do MariaDB.

## 4. Aplicativo

```bash
sudo useradd --system --home /opt/snipe-it-mobile --shell /sbin/nologin snipe-mobile
sudo git clone https://github.com/JoseReche/Scaner-Snipe-it.git /opt/snipe-it-mobile
sudo chown -R snipe-mobile:snipe-mobile /opt/snipe-it-mobile
cd /opt/snipe-it-mobile
sudo -u snipe-mobile npm ci --omit=dev
sudo -u snipe-mobile cp .env.example .env
sudo -u snipe-mobile chmod 600 .env
sudo -u snipe-mobile nano .env
```

Configuracao minima:

```env
PORT=3010
HTTPS=false
SNIPEIT_URL=https://seu-snipe-it
SNIPEIT_TOKEN=

INITIAL_ADMIN_USERNAME=admin-ti
INITIAL_ADMIN_NAME=Administrador TI
INITIAL_ADMIN_PASSWORD=coloque_uma_senha_forte_com_12_caracteres
INITIAL_ADMIN_ROLE=superadmin

DB_CLIENT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=snipe_mobile
DB_USER=snipe_mobile
DB_PASSWORD=use_a_mesma_senha_do_usuario_mysql
DB_CONNECTION_LIMIT=10
SESSION_TTL_SECONDS=28800
```

As credenciais ficam somente no `.env`. O aplicativo nao cria mais uma senha padrao embutida no codigo. Em uma instalacao nova, o primeiro inicio falha de forma segura se a senha inicial nao estiver configurada. O `superadmin` pode criar e excluir usuarios; o `admin` nao pode gerenciar usuarios.

Em uma instalacao existente, informe em `INITIAL_ADMIN_USERNAME` o usuario que deve receber o perfil `superadmin` e reinicie o servico uma vez. A promocao automatica ocorre somente quando ainda nao existe superadmin.

## 5. Servico systemd

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

Acesso ao aplicativo:

```text
http://192.168.0.3:3010
```

## 6. HTTPS direto no Node.js

Para liberar camera no celular sem certificado publico, gere uma CA interna e um certificado para o IP do servidor. Depois configure:

```env
HTTPS=true
SSL_CERT=/opt/certs/snipe-mobile/snipe-mobile.crt
SSL_KEY=/opt/certs/snipe-mobile/snipe-mobile.key
```

Reinicie e libere a porta:

```bash
sudo systemctl restart snipe-it-mobile
sudo firewall-cmd --permanent --add-port=3010/tcp
sudo firewall-cmd --reload
```

Acesse `https://192.168.0.3:3010` e instale a CA interna nos celulares. Nao reutilize a chave privada da CA como certificado do servidor.

## 7. Firewall

Libere somente o necessario na rede interna:

```bash
sudo firewall-cmd --permanent --add-port=3010/tcp
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

Se o Apache servir o phpMyAdmin somente na rede interna, nao abra a porta 80 para a internet.

## 8. Backup

```bash
mysqldump -u snipe_mobile -p snipe_mobile > snipe_mobile-$(date +%F).sql
tar -czf snipe-it-mobile-files-$(date +%F).tar.gz \
  /opt/snipe-it-mobile/uploads \
  /opt/snipe-it-mobile/data/terms
```

Guarde tambem uma copia protegida do `.env`, sem publica-la no GitHub.
