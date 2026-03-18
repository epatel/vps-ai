#!/usr/bin/env python3
"""WSGI entry point for gunicorn."""

from app import app, init_db

init_db()
