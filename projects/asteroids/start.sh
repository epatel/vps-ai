#!/bin/bash
# Start Asteroids server
cd "$(dirname "$0")"
source venv/bin/activate
python3 server.py "$@"
