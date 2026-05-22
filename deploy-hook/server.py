import hmac
import json
import os
import shlex
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


HOST = os.environ.get("DEPLOY_HOST", "0.0.0.0")
PORT = int(os.environ.get("DEPLOY_PORT", "8099"))
TOKEN = os.environ.get("DEPLOY_TOKEN", "")
WORKDIR = os.environ.get("DEPLOY_WORKDIR", "/workspace")
COMMAND = os.environ.get("DEPLOY_COMMAND", "docker compose -p immobilienverwaltung up -d --build app")

state = {
    "running": False,
    "last_started": None,
    "last_finished": None,
    "last_exit_code": None,
    "last_output": "",
}
lock = threading.Lock()


def run_deploy():
    with lock:
        state["running"] = True
        state["last_started"] = time.strftime("%Y-%m-%d %H:%M:%S")
        state["last_finished"] = None
        state["last_exit_code"] = None
        state["last_output"] = ""

    try:
        result = subprocess.run(
            shlex.split(COMMAND),
            cwd=WORKDIR,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=60 * 30,
        )
        output = result.stdout[-12000:]
        exit_code = result.returncode
    except Exception as error:
        output = str(error)
        exit_code = 1

    with lock:
        state["running"] = False
        state["last_finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
        state["last_exit_code"] = exit_code
        state["last_output"] = output


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json({"ok": True})
            return
        if parsed.path == "/status":
            if not self.authorized(parsed):
                self.send_json({"error": "unauthorized"}, 401)
                return
            with lock:
                self.send_json(state.copy())
            return
        if parsed.path == "/deploy":
            if not self.authorized(parsed):
                self.send_json({"error": "unauthorized"}, 401)
                return
            with lock:
                if state["running"]:
                    self.send_json({"ok": False, "message": "deploy already running", "status": state.copy()}, 409)
                    return
                thread = threading.Thread(target=run_deploy, daemon=True)
                thread.start()
            self.send_json({"ok": True, "message": "deploy started"})
            return
        self.send_json({"error": "not found"}, 404)

    def authorized(self, parsed):
        if not TOKEN:
            return False
        query_token = parse_qs(parsed.query).get("token", [""])[0]
        header_token = self.headers.get("X-Deploy-Token", "")
        return hmac.compare_digest(query_token, TOKEN) or hmac.compare_digest(header_token, TOKEN)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"deploy hook listening on {HOST}:{PORT}")
    server.serve_forever()
