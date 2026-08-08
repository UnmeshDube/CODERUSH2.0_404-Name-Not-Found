import os
import threading
import time
from http.server import HTTPServer, ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json

from dotenv import load_dotenv
from livekit.api.access_token import AccessToken, VideoGrants

load_dotenv()

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
    raise RuntimeError("Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET in .env")

FRONTEND_HOST = "127.0.0.1"
FRONTEND_PORT = 8010
TOKEN_HOST = "127.0.0.1"
TOKEN_PORT = 8080

class TokenHandler(SimpleHTTPRequestHandler):
    def _send_json(self, payload: dict[str, str], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/token":
            self.send_error(404, "Not Found")
            return

        query = parse_qs(parsed.query)
        identity = query.get("identity", ["guest"])[0]
        room = query.get("room", ["civicease-voice"])[0]
        name = query.get("name", [identity])[0]

        token = AccessToken(api_key=LIVEKIT_API_KEY, api_secret=LIVEKIT_API_SECRET)
        token.with_identity(identity)
        token.with_name(name)
        token.with_grants(VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
        jwt = token.to_jwt()

        self._send_json({
            "token": jwt,
            "url": LIVEKIT_URL,
            "room": room,
            "identity": identity,
            "name": name,
        })

    def log_message(self, format: str, *args: object) -> None:
        return


def start_token_server() -> None:
    server = HTTPServer((TOKEN_HOST, TOKEN_PORT), TokenHandler)
    print(f"Token server running at http://{TOKEN_HOST}:{TOKEN_PORT}/token")
    server.serve_forever()


def start_frontend_server() -> None:
    server = ThreadingHTTPServer((FRONTEND_HOST, FRONTEND_PORT), SimpleHTTPRequestHandler)
    print(f"Frontend server running at http://{FRONTEND_HOST}:{FRONTEND_PORT}")
    server.serve_forever()

import subprocess

def start_stt_server() -> None:
    print("STT server starting at http://127.0.0.1:8090")
    subprocess.Popen(["python", "serum_stt_server.py"])

if __name__ == "__main__":
    threading.Thread(target=start_token_server, daemon=True).start()
    threading.Thread(target=start_frontend_server, daemon=True).start()
    start_stt_server()
    print("Starting frontend, token, and STT servers...")
    print(f"Open your browser at http://{FRONTEND_HOST}:{FRONTEND_PORT}")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down.")
