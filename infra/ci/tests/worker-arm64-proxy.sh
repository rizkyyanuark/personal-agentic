#!/usr/bin/env bash
# Disposable fixture only: trust a test certificate inside this container, never on the host.
set -euo pipefail
port=${1:-18793}
[[ $port =~ ^[0-9]+$ ]]
mkdir -p /etc/nginx/worker-test
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost' -addext 'basicConstraints=critical,CA:TRUE' \
  -keyout /etc/nginx/worker-test/key.pem -out /usr/local/share/ca-certificates/worker-local-test.crt >/dev/null 2>&1
chmod 600 /etc/nginx/worker-test/key.pem
update-ca-certificates >/dev/null
cat > /etc/nginx/conf.d/worker-local-test.conf <<EOF
server {
  listen 127.0.0.1:19443 ssl;
  server_name localhost;
  ssl_certificate /usr/local/share/ca-certificates/worker-local-test.crt;
  ssl_certificate_key /etc/nginx/worker-test/key.pem;
  location / {
    proxy_pass http://host.docker.internal:$port;
    proxy_set_header Host localhost:$port;
    proxy_buffering off;
    proxy_read_timeout 120s;
  }
}
EOF
nginx -t
systemctl enable --now nginx
systemctl reload nginx
