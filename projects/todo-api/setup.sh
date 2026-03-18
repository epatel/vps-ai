#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

# Create venv and install deps
python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -r "$DIR/requirements.txt"

# Create .env if it doesn't exist
if [ ! -f "$DIR/.env" ]; then
    JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    cat > "$DIR/.env" << EOF
TODO_JWT_SECRET=${JWT_SECRET}
TODO_DB_PATH=${DIR}/todo.db
TODO_BASE_URL=https://ai.memention.net/todo-api
MJ_APIKEY_PUBLIC=
MJ_APIKEY_PRIVATE=
MJ_SENDER_EMAIL=noreply@memention.net
EOF
    chmod 600 "$DIR/.env"
    echo "Created .env – please edit with your Mailjet credentials"
fi

# Init database
cd "$DIR"
"$DIR/venv/bin/python" -c "from app import init_db; init_db()"

# Install systemd service
sudo cp "$DIR/todo-api.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now todo-api

echo "Todo API setup complete!"
