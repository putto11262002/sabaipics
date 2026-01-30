# VPS setup for SabaiPics FTP (Ubuntu 22.04/24.04)

Goal: provision a minimal Ubuntu VPS for a Dockerized FTPS server using
`ftp.yourdomain.com`.

## 1) Base packages + firewall

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg ufw

sudo ufw allow OpenSSH
sudo ufw allow 21/tcp
sudo ufw allow 990/tcp
sudo ufw allow 60000:60100/tcp
sudo ufw enable
sudo ufw status
```

## 2) Docker Engine + Compose plugin (official repo)

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker
```

## 3) Deploy directory + permissions

```bash
sudo mkdir -p /opt/sabaipics-ftp
sudo chown -R $USER:$USER /opt/sabaipics-ftp
```

Place your files in:
- Compose file: `/opt/sabaipics-ftp/docker-compose.yml`
- Environment file: `/opt/sabaipics-ftp/.env`

## 4) TLS certificate with certbot (standalone)

Standalone certbot needs port 80 temporarily.

```bash
sudo ufw allow 80/tcp

sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

sudo certbot certonly --standalone \
  -d ftp.yourdomain.com \
  -m admin@yourdomain.com \
  --agree-tos

sudo ufw delete allow 80/tcp
```

Certificates will be in:
- `/etc/letsencrypt/live/ftp.yourdomain.com/fullchain.pem`
- `/etc/letsencrypt/live/ftp.yourdomain.com/privkey.pem`

## 5) GHCR login (deploy token)

```bash
echo "<GHCR_TOKEN>" | docker login ghcr.io -u "<GHCR_USERNAME>" --password-stdin
```

## 6) Run the stack

```bash
cd /opt/sabaipics-ftp
docker compose pull
docker compose up -d
docker compose ps
```

## Optional minimal hardening

```bash
sudo apt install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
```

Notes:
- Ensure your FTP container is configured for passive ports `60000-60100` and
  uses the cert paths above.
- Re-login if `docker` permissions are not applied after `usermod`.
