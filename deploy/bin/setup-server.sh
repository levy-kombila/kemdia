#!/usr/bin/env bash
# =============================================================================
# setup-server.sh — préparation et durcissement d'un VPS Ubuntu 24.04 pour Kemdia.
# À lancer UNE fois, en root, sur un serveur neuf :
#
#   scp -r deploy root@IP_DU_SERVEUR:/root/kemdia-deploy
#   ssh root@IP_DU_SERVEUR
#   ADMIN_USER=levy ADMIN_PUBKEY="ssh-ed25519 AAAA... levy@pc" \
#   CI_PUBKEY="ssh-ed25519 AAAA... github-actions-kemdia" \
#   IMAGE_REPO=ghcr.io/levy-kombila/kemdia \
#     bash /root/kemdia-deploy/bin/setup-server.sh
#
# Puis, une fois par environnement (S7-T04) : sudo /opt/kemdia/bin/init-secrets.sh <staging|production> <domaine>
#
# Option --fichiers-seulement : installe uniquement les fichiers Kemdia dans /opt/kemdia (ni paquets, ni comptes,
# ni SSH, ni pare-feu). Sert au test de la pile dans la CI ; ne durcit RIEN : jamais sur un vrai serveur.
# =============================================================================
set -Eeuo pipefail

SRC=$(cd "$(dirname "$0")/.." && pwd)
ROOT=/opt/kemdia
FILES_ONLY=false
[[ ${1:-} == --fichiers-seulement ]] && FILES_ONLY=true
IMAGE_REPO=${IMAGE_REPO:-ghcr.io/levy-kombila/kemdia}
[[ $IMAGE_REPO =~ ^[a-z0-9.:-]+(/[a-z0-9._-]+)+$ ]] || {
  echo "IMAGE_REPO invalide : $IMAGE_REPO" >&2
  exit 1
}

system_packages() {
  echo "==> Mises à jour système + correctifs de sécurité automatiques"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get upgrade -yq
  apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades openssl restic
  dpkg-reconfigure -f noninteractive unattended-upgrades
  # Redémarrage automatique quand un correctif l'exige (noyau, bibliothèque C), la nuit ; les conteneurs repartent
  # seuls (restart: unless-stopped)
  cat >/etc/apt/apt.conf.d/52kemdia-reboot <<'APT'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
APT
}

docker_engine() {
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
}

accounts() {
  : "${ADMIN_USER:?ADMIN_USER requis : votre compte admin}"
  : "${ADMIN_PUBKEY:?ADMIN_PUBKEY requis : votre clé SSH publique}"
  : "${CI_PUBKEY:?CI_PUBKEY requis : clé publique dédiée à GitHub Actions}"
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
}

kemdia_files() { # kemdia_files <utilisateur> <groupe> : qui lance deploy.sh (deploy:deploy sur le serveur)
  local user=$1 group=$2
  echo "==> Fichiers Kemdia dans $ROOT"
  install -d -m 755 "$ROOT" "$ROOT/bin" "$ROOT/app" "$ROOT/proxy"
  install -d -m 750 -o "$user" -g "$group" "$ROOT/state"
  # Secrets (S7-T04) : root écrit, le groupe deploy lit (docker compose les lit pour la CI)
  install -d -m 750 -o root -g "$group" "$ROOT/secrets"
  install -m 755 "$SRC/bin/deploy.sh" "$ROOT/bin/deploy.sh"
  install -m 700 "$SRC/bin/init-secrets.sh" "$ROOT/bin/init-secrets.sh"
  # Sauvegardes (S7-T05) : root seulement (elles lisent le mot de passe des sauvegardes)
  install -m 700 "$SRC/bin/backup.sh" "$ROOT/bin/backup.sh"
  install -m 700 "$SRC/bin/restore.sh" "$ROOT/bin/restore.sh"
  install -m 644 "$SRC/app/compose.yml" "$ROOT/app/compose.yml"
  install -m 644 "$SRC/proxy/compose.yml" "$ROOT/proxy/compose.yml"
  install -m 644 "$SRC/proxy/Caddyfile" "$ROOT/proxy/Caddyfile"
  [[ -f $ROOT/proxy/.env ]] || install -m 600 "$SRC/proxy/.env.example" "$ROOT/proxy/.env"
  # Seul dépôt d'images que deploy.sh accepte (propriété de root : la CI ne peut pas le changer)
  printf 'REGISTRY=%s\n' "$IMAGE_REPO" >"$ROOT/deploy.conf"
  chmod 644 "$ROOT/deploy.conf"
  touch "$ROOT/deploy.log" && chown "$user:$group" "$ROOT/deploy.log"
  local env
  for env in production staging; do
    docker network inspect "kemdia-edge-$env" >/dev/null 2>&1 || docker network create "kemdia-edge-$env" >/dev/null
  done
}

backup_timers() {
  echo "==> Sauvegardes : chaque nuit à 02:00, restauration vérifiée chaque dimanche (S7-T05)"
  install -d -m 700 /var/backups/kemdia /var/cache/kemdia-restic
  local unit
  for unit in kemdia-backup.service kemdia-backup.timer kemdia-restore-check.service kemdia-restore-check.timer; do
    install -m 644 "$SRC/systemd/$unit" "/etc/systemd/system/$unit"
  done
  systemctl daemon-reload
  # Les minuteurs n'échouent pas tant que backup.sh init n'est pas lancé : ils le signalent dans le journal
  systemctl enable --now kemdia-backup.timer kemdia-restore-check.timer
}

ssh_hardening() {
  echo "==> SSH : clés uniquement, pas de connexion root"
  cat >/etc/ssh/sshd_config.d/99-kemdia.conf <<'SSHD'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowAgentForwarding no
AllowUsers ADMIN_PLACEHOLDER deploy
SSHD
  sed -i "s/ADMIN_PLACEHOLDER/$ADMIN_USER/" /etc/ssh/sshd_config.d/99-kemdia.conf
  sshd -t && systemctl reload ssh
}

kernel_hardening() {
  echo "==> Noyau : réglages réseau et mémoire prudents"
  # ip_forward reste actif : Docker en a besoin
  cat >/etc/sysctl.d/99-kemdia.conf <<'SYSCTL'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
SYSCTL
  sysctl --system >/dev/null
}

firewall() {
  echo "==> Pare-feu : seuls SSH, HTTP et HTTPS sont ouverts"
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
}

fail2ban_ssh() {
  echo "==> Fail2ban (bannit les IP qui forcent SSH)"
  cat >/etc/fail2ban/jail.d/sshd.local <<'F2B'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
F2B
  systemctl restart fail2ban
}

if $FILES_ONLY; then
  # Garde-fou (relecture S7-T04) : sur un vrai serveur, cette option rendrait l'état à root et casserait deploy.sh
  if [[ ${GITHUB_ACTIONS:-} != true ]] || id deploy >/dev/null 2>&1; then
    echo "--fichiers-seulement est réservé au test de la CI (GitHub Actions, sans compte deploy)" >&2
    exit 1
  fi
  kemdia_files root "${KEMDIA_GROUP:-deploy}"
  echo "✅ Fichiers installés (aucun durcissement : --fichiers-seulement)."
  exit 0
fi

: "${ADMIN_USER:?ADMIN_USER requis : votre compte admin}"
system_packages
docker_engine
accounts
kemdia_files deploy deploy
backup_timers
ssh_hardening
kernel_hardening
firewall
fail2ban_ssh

cat <<EOF

✅ Serveur prêt.
Étapes suivantes (dans un NOUVEAU terminal, sans fermer celui-ci tant que la connexion n'est pas testée) :
  1. ssh $ADMIN_USER@<IP>                                        # vérifier l'accès admin
  2. sudo $ROOT/bin/init-secrets.sh production <domaine>         # secrets de la production (une fois)
     sudo $ROOT/bin/init-secrets.sh staging staging.<domaine>    # secrets de la préproduction (une fois)
  3. sudo $ROOT/bin/backup.sh init                                # sauvegardes ; copier $ROOT/secrets/backup.password
                                                                 # dans ton gestionnaire de mots de passe (S3 : guide §11)
  4. sudo nano $ROOT/proxy/.env                                  # domaines, e-mail, mot de passe staging
  5. cd $ROOT/proxy && sudo docker compose up -d
  6. ssh-keyscan -t ed25519 <IP>                                 # à copier dans le secret GitHub DEPLOY_SSH_KNOWN_HOSTS
EOF
