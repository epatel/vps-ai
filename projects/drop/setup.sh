#!/bin/bash
set -e
cd "$(dirname "$0")"

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

mkdir -p uploads
echo "Setup complete. Activate with: source venv/bin/activate"
