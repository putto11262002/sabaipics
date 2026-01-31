#!/usr/bin/env bash
set -euo pipefail

DOMAIN="ftp.sabaipics.com"
EMAIL="putto11262002@gmail.com"
API_URL="https://api.sabaipics.com"

apt update
apt install -y ca-certificates curl gnupg ufw

ufw allow OpenSSH
ufw allow 21/tcp
ufw allow 990/tcp
ufw allow 60000:60100/tcp
ufw allow 80/tcp
ufw --force enable

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

mkdir -p /opt/sabaipics-ftp
cd /opt/sabaipics-ftp

snap install core
snap refresh core
snap install --classic certbot
ln -s /snap/bin/certbot /usr/bin/certbot || true

certbot certonly --standalone -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive

cat > /opt/sabaipics-ftp/.env <<ENV
API_URL=${API_URL}
FTP_LISTEN_ADDRESS=0.0.0.0:21
FTP_PASSIVE_PORT_START=60000
FTP_PASSIVE_PORT_END=60100
FTP_IDLE_TIMEOUT=600
FTP_DEBUG=false
TLS_CERT_PATH=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/${DOMAIN}/privkey.pem
IMPLICIT_FTPS_ENABLED=true
IMPLICIT_FTPS_PORT=0.0.0.0:990
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
ENV

cat > /opt/sabaipics-ftp/docker-compose.yml <<'YML'
services:
  ftp-server:
    image: ghcr.io/putto11262002/sabaipics-ftp-server:latest
    container_name: sabaipics-ftp-server
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "21:21"
      - "990:990"
      - "60000-60100:60000-60100"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
YML

echo "Bootstrap complete. Run deploy_container.sh after logging into GHCR."
