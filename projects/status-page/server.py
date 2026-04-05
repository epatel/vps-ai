#!/usr/bin/env python3
"""Status page server for ai.memention.net"""

import json
import os
import socket
import subprocess
import time
import urllib.request
from collections import deque
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Lock, Thread

PORT = 5001
HOSTNAME = "ai.memention.net"

# Services to monitor: (name, path, check_type, target)
SERVICES = [
    # Server-based services (check by port)
    ("Webhook", "/webhook", "port", 5000),
    ("Status Page", "/status", "port", 5001),
    ("Todo API", "/todo-api", "port", 5003),
    ("Asteroids", "/asteroids", "port", 8082),
    # Static file projects (check index.html exists)
    ("Scramble", "/scramble", "file", "scramble"),
    ("Badge", "/badge", "file", "badge"),
    ("Breakout", "/breakout", "file", "breakout"),
    ("Flutter Demo", "/flutter_demo", "file", "flutter_demo/build/web"),
    ("Todo App", "/todo-app", "file", "todo-app/build/web"),
    ("Trump's 48h", "/trumps48hours", "file", "trumps48hours"),
]

# History buffers: each entry is [time_label, min, max, avg]
HISTORY_SIZE_CPU = 60       # 10 min at 10s intervals
HISTORY_SIZE_MEM = 60       # 1 hour at 1 min intervals
HISTORY_SIZE_DISK = 288     # 1 day at 5 min intervals
HISTORY_SIZE_CLAUDE = 60    # 1 hour at 1 min intervals

history_cpu = deque(maxlen=HISTORY_SIZE_CPU)
history_mem = deque(maxlen=HISTORY_SIZE_MEM)
history_disk = deque(maxlen=HISTORY_SIZE_DISK)
history_claude = deque(maxlen=HISTORY_SIZE_CLAUDE)
history_lock = Lock()

# Accumulators for aggregating samples
cpu_samples = []
mem_samples = []
disk_samples = []
claude_samples = []
sample_lock = Lock()


def get_uptime():
    """Get system uptime."""
    try:
        with open("/proc/uptime") as f:
            secs = float(f.read().split()[0])
        days = int(secs // 86400)
        hours = int((secs % 86400) // 3600)
        mins = int((secs % 3600) // 60)
        parts = []
        if days:
            parts.append(f"{days} day{'s' if days != 1 else ''}")
        if hours:
            parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
        parts.append(f"{mins} minute{'s' if mins != 1 else ''}")
        return {"seconds": int(secs), "human": ", ".join(parts)}
    except Exception:
        return {"seconds": 0, "human": "unknown"}


def get_cpu():
    """Get CPU load averages."""
    try:
        load1, load5, load15 = os.getloadavg()
        cores = os.cpu_count() or 1
        return {
            "load_1m": round(load1, 2),
            "load_5m": round(load5, 2),
            "load_15m": round(load15, 2),
            "cores": cores,
        }
    except Exception:
        return {"load_1m": 0, "load_5m": 0, "load_15m": 0, "cores": 1}


def get_memory():
    """Get memory usage from /proc/meminfo."""
    try:
        info = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    info[parts[0].rstrip(":")] = int(parts[1])
        total = info.get("MemTotal", 0)
        available = info.get("MemAvailable", 0)
        used = total - available
        pct = round(used / total * 100, 1) if total else 0
        return {
            "total_mb": round(total / 1024, 1),
            "used_mb": round(used / 1024, 1),
            "percent_used": pct,
        }
    except Exception:
        return {"total_mb": 0, "used_mb": 0, "percent_used": 0}


def get_disk():
    """Get disk usage for root partition."""
    try:
        st = os.statvfs("/")
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - free
        pct = round(used / total * 100, 1) if total else 0
        return {
            "total_gb": round(total / 1e9, 1),
            "used_gb": round(used / 1e9, 1),
            "percent_used": pct,
        }
    except Exception:
        return {"total_gb": 0, "used_gb": 0, "percent_used": 0}


def get_claude_count():
    """Count running Claude instances."""
    try:
        result = subprocess.run(
            ["pgrep", "-c", "claude"],
            capture_output=True, text=True, timeout=5
        )
        return int(result.stdout.strip()) if result.returncode == 0 else 0
    except Exception:
        return 0


def check_nginx(path):
    """Check if a path is served by nginx (not falling back to default page).
    Returns 'up' if served correctly, 'fallback' if nginx default, 'down' if unreachable."""
    try:
        url = f"https://{HOSTNAME}{path}"
        if not url.endswith("/"):
            url += "/"
        req = urllib.request.Request(url, method="GET")
        # Skip TLS verification for localhost check
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=3, context=ctx) as resp:
            body = resp.read(4096).decode("utf-8", errors="replace")
            # Detect nginx default page
            if "welcome to nginx" in body.lower() or "default server" in body.lower():
                return "fallback"
            return "up"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "fallback"
        return "down"
    except Exception:
        return "down"


def check_service(svc):
    """Check if a service is running. Returns status and optional detail."""
    name, path, check_type, target = svc
    status = "down"
    detail = None
    if check_type == "port":
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            s.connect(("127.0.0.1", target))
            s.close()
            # Port is up, now check if nginx routes to it properly
            nginx_status = check_nginx(path)
            if nginx_status == "up":
                status = "up"
            elif nginx_status == "fallback":
                status = "degraded"
                detail = "nginx fallback"
            else:
                status = "degraded"
                detail = "port ok, nginx error"
        except Exception:
            status = "down"
    elif check_type == "file":
        project_dir = Path("/home/epatel/vps-ai/projects") / target
        file_exists = (project_dir / "index.html").exists()
        nginx_status = check_nginx(path)
        if file_exists and nginx_status == "up":
            status = "up"
        elif file_exists and nginx_status == "fallback":
            status = "degraded"
            detail = "files ok, nginx fallback"
        elif file_exists and nginx_status == "down":
            status = "degraded"
            detail = "files ok, nginx error"
        elif not file_exists and nginx_status == "up":
            status = "degraded"
            detail = "no build files"
        else:
            status = "down"
            detail = "no build" if not file_exists else None
    result = {"name": name, "path": path, "status": status}
    if detail:
        result["detail"] = detail
    return result


def get_status_data():
    """Build the full status JSON."""
    now = datetime.now()
    services = [check_service(s) for s in SERVICES if s[2] == "port"]
    static_sites = [check_service(s) for s in SERVICES if s[2] == "file"]
    cpu = get_cpu()
    mem = get_memory()
    disk = get_disk()
    claude_count = get_claude_count()

    with history_lock:
        h_cpu = list(history_cpu)
        h_mem = list(history_mem)
        h_disk = list(history_disk)
        h_claude = list(history_claude)

    return {
        "hostname": HOSTNAME,
        "timestamp": now.isoformat(),
        "services": services,
        "static_sites": static_sites,
        "system": {
            "uptime": get_uptime(),
            "cpu": cpu,
            "memory": mem,
            "disk": disk,
            "claude": {"count": claude_count},
        },
        "history": {
            "cpu": h_cpu,
            "memory": h_mem,
            "disk": h_disk,
            "claude": h_claude,
        },
    }


def collector_loop():
    """Background thread that collects metrics samples and aggregates into history."""
    last_cpu_flush = time.time()
    last_mem_flush = time.time()
    last_disk_flush = time.time()
    last_claude_flush = time.time()

    while True:
        now = time.time()
        ts = datetime.now().strftime("%H:%M:%S")
        ts_short = datetime.now().strftime("%H:%M")

        cpu = get_cpu()
        mem = get_memory()
        disk = get_disk()
        claude_count = get_claude_count()

        with sample_lock:
            cpu_samples.append(cpu["load_1m"])
            mem_samples.append(mem["percent_used"])
            disk_samples.append(disk["percent_used"])
            claude_samples.append(claude_count)

        # Flush CPU every 10 seconds
        if now - last_cpu_flush >= 10:
            with sample_lock:
                samples = list(cpu_samples)
                cpu_samples.clear()
            if samples:
                entry = [ts, min(samples), max(samples), round(sum(samples) / len(samples), 2)]
                with history_lock:
                    history_cpu.append(entry)
            last_cpu_flush = now

        # Flush memory every 60 seconds
        if now - last_mem_flush >= 60:
            with sample_lock:
                samples = list(mem_samples)
                mem_samples.clear()
            if samples:
                entry = [ts_short, min(samples), max(samples), round(sum(samples) / len(samples), 1)]
                with history_lock:
                    history_mem.append(entry)
            last_mem_flush = now

        # Flush disk every 5 minutes
        if now - last_disk_flush >= 300:
            with sample_lock:
                samples = list(disk_samples)
                disk_samples.clear()
            if samples:
                entry = [ts_short, min(samples), max(samples), round(sum(samples) / len(samples), 1)]
                with history_lock:
                    history_disk.append(entry)
            last_disk_flush = now

        # Flush claude every 60 seconds
        if now - last_claude_flush >= 60:
            with sample_lock:
                samples = list(claude_samples)
                claude_samples.clear()
            if samples:
                entry = [ts_short, min(samples), max(samples), round(sum(samples) / len(samples), 1)]
                with history_lock:
                    history_claude.append(entry)
            last_claude_flush = now

        time.sleep(5)


# Load HTML template once
HTML_PATH = Path(__file__).parent / "index.html"


class StatusHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/status/json":
            data = get_status_data()
            payload = json.dumps(data)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(payload.encode())
        elif self.path == "/status" or self.path == "/status/":
            html = HTML_PATH.read_text()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # Silence request logs


def main():
    # Start collector thread
    t = Thread(target=collector_loop, daemon=True)
    t.start()

    server = HTTPServer(("127.0.0.1", PORT), StatusHandler)
    print(f"Status server running on port {PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
