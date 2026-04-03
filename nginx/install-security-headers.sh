#!/usr/bin/env bash
#
# Install nginx security headers on the server.
# Run with: sudo bash nginx/install-security-headers.sh
#
set -euo pipefail

SNIPPET_SRC="$(dirname "$0")/security-headers.conf"
SNIPPET_DEST="/etc/nginx/snippets/security-headers.conf"
SITE_CONF="/etc/nginx/sites-available/ai.memention.net"

# Copy snippet
cp "$SNIPPET_SRC" "$SNIPPET_DEST"
echo "Installed $SNIPPET_DEST"

# Add include to site config if not already present
if grep -q "security-headers.conf" "$SITE_CONF"; then
    echo "Site config already includes security headers"
else
    # Insert 'include snippets/security-headers.conf;' after each 'server {' line
    sed -i '/^server {/a\    include snippets/security-headers.conf;' "$SITE_CONF"
    echo "Added include directive to $SITE_CONF"
fi

# Test and reload
nginx -t && systemctl reload nginx
echo "nginx reloaded with security headers"
