#!/usr/bin/env bash
# =============================================================================
# setup-server.sh — préparation et durcissement d'un VPS Ubuntu 24.04 pour Kemdia.
# À lancer UNE fois, en root, sur un serveur neuf :
#
#   scp -r deploy root@IP_DU_SERVEUR:/root/kemdia-deploy
#   ssh root@IP_DU_SERVEUR
#   ADMIN_USER=levy ADMIN_PUBKEY="ssh-ed25519 AAAA... levy@pc" \
#   CI_PUBKEY="ssh-ed25519 AAAA... github-actions-kemdia" \
#     bash /root/kemdia-deploy/bin/setup-server.sh
# =============================================================================
set -Eeuo pipefail

: "${ADMIN_USER:?ADMIN_USER requis : votre compte admin}"
: "${ADMIN_PUBKEY:?ADMIN_PUBKEY requis : votre clé SSH publique}"
: "${CI_PUBKEY:?CI_PUBKEY requis : clé publique dédiée à GitHub Actions}"
SRC=$(cd "$(dirname "$0")/.." && pwd)
ROOT=/opt/kemdia

echo "==> Mises à jour système + correctifs de sécurité automatiques"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker Engine (dépôt officiel)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shellcheck source=/dev/null
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  >/etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true,
  "no-new-privileges": true
}
JSON
systemctl restart docker

echo "==> Comptes : $ADMIN_USER (admin, sudo) et deploy (CI, restreint)"
id "$ADMIN_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$ADMIN_USER"
usermod -aG sudo,docker "$ADMIN_USER"
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
echo "$ADMIN_PUBKEY" >"/home/$ADMIN_USER/.ssh/authorized_keys"
chown "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh/authorized_keys"
chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"
echo "  ⚠️  Définissez un mot de passe sudo pour $ADMIN_USER : passwd $ADMIN_USER"

id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# La clé de la CI ne peut exécuter QUE deploy.sh (pas de shell, pas de tunnel)
echo "command=\"$ROOT/bin/deploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $CI_PUBKEY" \
  >/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> Fichiers Kemdia dans $ROOT"
install -d -m 755 "$ROOT" "$ROOT/bin" "$ROOT/app" "$ROOT/proxy"
install -d -m 750 -o deploy -g deploy "$ROOT/state"
install -m 755 "$SRC/bin/deploy.sh" "$ROOT/bin/deploy.sh"
install -m 644 "$SRC/app/compose.yml" "$ROOT/app/compose.yml"
install -m 644 "$SRC/proxy/compose.yml" "$ROOT/proxy/compose.yml"
install -m 644 "$SRC/proxy/Caddyfile" "$ROOT/proxy/Caddyfile"
[[ -f $ROOT/proxy/.env ]] || install -m 600 "$SRC/proxy/.env.example" "$ROOT/proxy/.env"
touch "$ROOT/deploy.log" && chown deploy:deploy "$ROOT/deploy.log"
docker network inspect edge >/dev/null 2>&1 || docker network create edge

echo "==> SSH : clés uniquement, pas de connexion root"
cat >/etc/ssh/sshd_config.d/99-kemdia.conf <<'SSHD'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
AllowUsers ADMIN_PLACEHOLDER deploy
SSHD
sed -i "s/ADMIN_PLACEHOLDER/$ADMIN_USER/" /etc/ssh/sshd_config.d/99-kemdia.conf
sshd -t && systemctl reload ssh

echo "==> Pare-feu : seuls SSH, HTTP et HTTPS sont ouverts"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Fail2ban (bannit les IP qui forcent SSH)"
cat >/etc/fail2ban/jail.d/sshd.local <<'F2B'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
F2B
systemctl restart fail2ban

cat <<EOF

✅ Serveur prêt.
Étapes suivantes (dans un NOUVEAU terminal, sans fermer celui-ci tant que la connexion n'est pas testée) :
  1. ssh $ADMIN_USER@<IP>                      # vérifier l'accès admin
  2. sudo nano $ROOT/proxy/.env                # domaines, e-mail, mot de passe staging
  3. cd $ROOT/proxy && sudo docker compose up -d
  4. ssh-keyscan -t ed25519 <IP>               # à copier dans le secret GitHub SSH_KNOWN_HOSTS
EOF
