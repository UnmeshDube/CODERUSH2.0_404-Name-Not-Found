from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv
from livekit.api.access_token import AccessToken, VideoGrants

load_dotenv()

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
    raise RuntimeError("Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET in .env")

HOST = "127.0.0.1"
PORT = 8080

class TokenHandler(BaseHTTPRequestHandler):
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

if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), TokenHandler)
    print(f"Token server running at http://{HOST}:{PORT}/token")
    print("Use query params: ?identity=guest123&room=civicease-voice&name=Guest")
    server.serve_forever()
