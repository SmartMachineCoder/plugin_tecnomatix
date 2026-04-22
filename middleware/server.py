# /// script
# requires-python = ">=3.9"
# ///
# =============================================================================
#  IH MIDDLEWARE SERVER — for Plant Simulation Python Module
# =============================================================================
#
#  HOW TO USE IN PLANT SIMULATION:
#  ─────────────────────────────────────────────────────────────────────────────
#  1. Open Plant Simulation → create a new Method (type: Python)
#  2. Paste this entire file into that method
#  3. At the BOTTOM of this file, call start_server() once
#     (e.g. in your Init / EventController method)
#  4. In the Angular plugin Setup screen set:
#       Deployment  →  On-Premises
#       Middleware URL  →  http://localhost:5000
#       API Key  →  (leave empty)
#  5. Click "Send to Plant Sim" in the plugin — data arrives here
#  6. Read values in your simulation logic using get_latest_value()
#
#  NO pip install required — uses Python standard library only.
# =============================================================================

import json
import socketserver
import threading
import secrets
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse


class _ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    """Handle each HTTP request in a separate thread."""
    daemon_threads = True

# ── Settings — change PORT if 5000 is already in use ─────────────────────────
PORT    = 5000
API_KEY = ""       # leave empty to allow all requests, or set a secret string
# ─────────────────────────────────────────────────────────────────────────────

# Internal state (globals persist across Plant Simulation method calls)
_server_instance  = None
_server_thread    = None
_data_store: dict = {}          # { assetId: full_payload_dict }
_data_lock        = threading.Lock()

_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Content-Type": "application/json",
}


# =============================================================================
#  PUBLIC API — call these from your Plant Simulation methods
# =============================================================================

def start_server():
    """
    Start the HTTP server in a background thread.
    Call this once from your Init or EventController method.

    Example (Plant Simulation Init method):
        start_server()
    """
    global _server_instance, _server_thread

    if _server_instance is not None:
        _log("SERVER", f"Already running on port {_server_instance.server_address[1]}")
        return

    port = PORT
    while port < PORT + 10:
        try:
            _server_instance = _ThreadedHTTPServer(("0.0.0.0", port), _Handler)
            break
        except OSError:
            _log("SERVER", f"Port {port} in use, trying {port + 1}...")
            port += 1
    else:
        _log("SERVER", f"ERROR: No free port found in range {PORT}–{PORT + 9}")
        return

    _server_thread = threading.Thread(target=_server_instance.serve_forever, daemon=True)
    _server_thread.start()
    _log("SERVER", f"Started — listening on http://localhost:{port}")
    _log("SERVER", f"  POST /ingest    ← Angular plugin sends data here")
    _log("SERVER", f"  GET  /data      ← inspect all stored asset data")
    _log("SERVER", f"  GET  /health    ← quick health check")
    threading.Thread(target=_show_startup_popup, args=(port,), daemon=True).start()


def stop_server():
    """
    Stop the HTTP server.
    Call this from your simulation end / cleanup method.

    Example:
        stop_server()
    """
    global _server_instance, _server_thread

    if _server_instance is None:
        return
    _server_instance.shutdown()
    _server_instance.server_close()
    _server_instance = None
    _server_thread   = None
    _log("SERVER", "Stopped")


def get_latest_value(asset_id: str, variable_name: str):
    """
    Return the most recent value for a variable (last item in values list).
    Returns None if no data has arrived yet for that asset/variable.

    Example:
        speed = get_latest_value("asset-uuid-123", "conveyor_speed")
        if speed is not None:
            # use speed in your simulation
    """
    with _data_lock:
        payload = _data_store.get(asset_id)
    if not payload:
        return None
    for var in payload.get("variables", []):
        if var.get("name") == variable_name:
            values = var.get("values", [])
            if values:
                return values[-1].get("value")
    return None


def get_all_values(asset_id: str, variable_name: str) -> list:
    """
    Return ALL time-series values for a variable as a list of dicts:
      [{ "time": "2026-03-22T08:01:00Z", "value": 3.21 }, ...]
    Returns empty list if no data found.

    Example:
        values = get_all_values("asset-uuid-123", "temperature")
        for point in values:
            print(point["time"], point["value"])
    """
    with _data_lock:
        payload = _data_store.get(asset_id)
    if not payload:
        return []
    for var in payload.get("variables", []):
        if var.get("name") == variable_name:
            return var.get("values", [])
    return []


def get_asset_payload(asset_id: str) -> dict:
    """
    Return the full raw payload for an asset (as received from the plugin).
    Returns empty dict if no data found.

    Example:
        payload = get_asset_payload("asset-uuid-123")
        print(payload["assetName"], payload["from"], payload["to"])
    """
    with _data_lock:
        return dict(_data_store.get(asset_id, {}))


def list_assets() -> list:
    """
    Return a list of assetIds that have received data so far.

    Example:
        ids = list_assets()
        print("Assets with data:", ids)
    """
    with _data_lock:
        return list(_data_store.keys())


def list_variables(asset_id: str) -> list:
    """
    Return a list of variable names available for an asset.

    Example:
        vars = list_variables("asset-uuid-123")
        print("Available variables:", vars)
    """
    with _data_lock:
        payload = _data_store.get(asset_id, {})
    return [v.get("name") for v in payload.get("variables", [])]


def clear_data():
    """
    Clear all stored data (all assets).
    """
    with _data_lock:
        _data_store.clear()
    _log("STORE", "All data cleared")


def is_running() -> bool:
    """Returns True if the server is currently running."""
    return _server_instance is not None


# =============================================================================
#  STARTUP POPUP — shows server URL with quick-action buttons
# =============================================================================

def _show_startup_popup(port: int) -> None:
    try:
        import tkinter as tk
        import webbrowser

        url = f"http://localhost:{port}"
        settings_text = (
            f"Deployment     :  On-Premises\n"
            f"Middleware URL :  {url}\n"
            f"API Key        :  {'(your key)' if API_KEY else '(leave empty)'}"
        )

        root = tk.Tk()
        root.title("IH Middleware Server")
        root.resizable(False, False)
        root.attributes("-topmost", True)

        frame = tk.Frame(root, padx=20, pady=15)
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text="Server is running", font=("Segoe UI", 12, "bold"), fg="#2e7d32").pack(anchor="w")
        tk.Label(frame, text=f"Listening on  {url}", font=("Consolas", 10), fg="#555").pack(anchor="w", pady=(4, 0))

        tk.Label(frame, text="Plugin Setup Settings:", font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(14, 3))
        box = tk.Text(frame, height=3, font=("Consolas", 9), bg="#f5f5f5", relief="solid", bd=1)
        box.insert("1.0", settings_text)
        box.config(state="disabled")
        box.pack(fill="x")

        btn_frame = tk.Frame(frame)
        btn_frame.pack(pady=(14, 0), fill="x")

        def open_browser():
            webbrowser.open(url + "/health")

        def copy_settings():
            root.clipboard_clear()
            root.clipboard_append(settings_text)
            root.update()
            copy_btn.config(text="Copied ✓")
            root.after(2000, lambda: copy_btn.config(text="Copy Plugin Settings"))

        tk.Button(btn_frame, text="Open in Browser", command=open_browser, width=16).pack(side="left", padx=(0, 6))
        copy_btn = tk.Button(btn_frame, text="Copy Plugin Settings", command=copy_settings, width=22)
        copy_btn.pack(side="left")
        tk.Button(btn_frame, text="Close", command=root.destroy, width=8).pack(side="right")

        root.mainloop()
    except Exception as e:
        _log("POPUP", f"Could not show popup: {e}")


# =============================================================================
#  INTERNAL HTTP SERVER — do not call these directly
# =============================================================================

def _log(tag: str, msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] [{tag}] {msg}")


def _send_json(handler, status: int, body: dict) -> None:
    data = json.dumps(body, default=str).encode()
    handler.send_response(status)
    for k, v in _CORS.items():
        handler.send_header(k, v)
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)
    handler.wfile.flush()


def _check_auth(handler) -> bool:
    if not API_KEY:
        return True
    provided_key = handler.headers.get("x-api-key", "")
    return secrets.compare_digest(provided_key, API_KEY)


class _Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # silence default request logging

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in _CORS.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.flush()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")

        if path == "/health":
            with _data_lock:
                assets = list(_data_store.keys())
            _send_json(self, 200, {
                "status":         "running",
                "port":           PORT,
                "assets_stored":  len(assets),
                "asset_ids":      assets,
            })

        elif path == "/data":
            if not _check_auth(self):
                return _send_json(self, 401, {"error": "Unauthorized"})
            with _data_lock:
                _send_json(self, 200, dict(_data_store))

        elif path.startswith("/data/"):
            if not _check_auth(self):
                return _send_json(self, 401, {"error": "Unauthorized"})
            asset_id = path[len("/data/"):]
            with _data_lock:
                payload = _data_store.get(asset_id)
            if payload is None:
                _send_json(self, 404, {"error": f"No data for asset '{asset_id}'"})
            else:
                _send_json(self, 200, payload)

        else:
            _send_json(self, 404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")

        if path == "/ingest":
            self._ingest()
        elif path == "/clear":
            if not _check_auth(self):
                return _send_json(self, 401, {"error": "Unauthorized"})
            with _data_lock:
                _data_store.clear()
            _log("STORE", "Cleared via HTTP")
            _send_json(self, 200, {"status": "cleared"})
        else:
            _send_json(self, 404, {"error": "Not found"})

    def _ingest(self):
        if not _check_auth(self):
            return _send_json(self, 401, {"error": "Unauthorized"})

        length = int(self.headers.get("Content-Length", 0))
        try:
            payload: dict = json.loads(self.rfile.read(length))
        except Exception as e:
            _log("INGEST", f"Bad JSON: {e}")
            return _send_json(self, 400, {"error": "Invalid JSON"})

        asset_id = payload.get("assetId")
        if not asset_id:
            return _send_json(self, 400, {"error": "Missing assetId"})

        payload["_receivedAt"] = datetime.now(timezone.utc).isoformat()

        with _data_lock:
            _data_store[asset_id] = payload

        var_count  = len(payload.get("variables", []))
        point_count = sum(len(v.get("values", [])) for v in payload.get("variables", []))

        _log("INGEST",
             f"{payload.get('assetName', asset_id)} | "
             f"{var_count} vars | {point_count} pts | "
             f"mode={payload.get('mode')} | "
             f"{payload.get('from','')} → {payload.get('to','')}")

        _send_json(self, 200, {
            "status":             "ok",
            "assetId":            asset_id,
            "variablesReceived":  var_count,
            "dataPointsReceived": point_count,
        })


# =============================================================================
#  START THE SERVER
#  ─────────────────────────────────────────────────────────────────────────────
#  Plant Simulation calls this method/script when it runs.
#  start_server() launches the HTTP listener in a background thread so it does
#  NOT block your simulation.
# =============================================================================
start_server()
