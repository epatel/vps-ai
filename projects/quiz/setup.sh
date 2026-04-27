#!/bin/bash
set -e
cd "$(dirname "$0")"

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

echo "Setup complete. Run with: ./venv/bin/python server.py"
