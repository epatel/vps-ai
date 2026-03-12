#!/usr/bin/env python3
"""Status page server for ai.memention.net"""

import json
import os
import subprocess
import time
from collections import deque
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Lock, Thread

PORT = 5001
HOSTNAME = "ai.memention.net"

# Services to monitor: (name, path, check_type, target)
SERVICES = [
    ("Webhook", "/webhook", "port", 5000),
    ("Scramble", "/scramble", "file", None),
    ("Breakout", "/breakout", "file", None),
    ("Badge", "/badge", "file", None),
]

# History buffers: each entry is [time_label, min, max, avg]
HISTORY_SIZE_CPU = 60       # 10 min at 10s intervals
HISTORY_SIZE_MEM = 60       # 1 hour at 1 min intervals
HISTORY_SIZE_DISK = 288     # 1 day at 5 min intervals

history_cpu = deque(maxlen=HISTORY_SIZE_CPU)
history_mem = deque(maxlen=HISTORY_SIZE_MEM)
history_disk = deque(maxlen=HISTORY_SIZE_DISK)
history_lock = Lock()

# Accumulators for aggregating samples
cpu_samples = []
mem_samples = []
disk_samples = []
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


def check_service(svc):
    """Check if a service is running."""
    name, path, check_type, target = svc
    status = "down"
    if check_type == "port":
        try:
            import socket
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2)
            s.connect(("127.0.0.1", target))
            s.close()
            status = "up"
        except Exception:
            status = "down"
    elif check_type == "file":
        # Static file project - check if index.html exists
        project_dir = Path("/home/epatel/vps-ai/projects") / name.lower()
        if (project_dir / "index.html").exists():
            status = "up"
        else:
            status = "down"
    return {"name": name, "path": path, "status": status}


def get_status_data():
    """Build the full status JSON."""
    now = datetime.now()
    services = [check_service(s) for s in SERVICES]
    cpu = get_cpu()
    mem = get_memory()
    disk = get_disk()

    with history_lock:
        h_cpu = list(history_cpu)
        h_mem = list(history_mem)
        h_disk = list(history_disk)

    return {
        "hostname": HOSTNAME,
        "timestamp": now.isoformat(),
        "services": services,
        "system": {
            "uptime": get_uptime(),
            "cpu": cpu,
            "memory": mem,
            "disk": disk,
        },
        "history": {
            "cpu": h_cpu,
            "memory": h_mem,
            "disk": h_disk,
        },
    }


def collector_loop():
    """Background thread that collects metrics samples and aggregates into history."""
    last_cpu_flush = time.time()
    last_mem_flush = time.time()
    last_disk_flush = time.time()

    while True:
        now = time.time()
        ts = datetime.now().strftime("%H:%M:%S")
        ts_short = datetime.now().strftime("%H:%M")

        cpu = get_cpu()
        mem = get_memory()
        disk = get_disk()

        with sample_lock:
            cpu_samples.append(cpu["load_1m"])
            mem_samples.append(mem["percent_used"])
            disk_samples.append(disk["percent_used"])

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
