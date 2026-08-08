"""Flask server exposing /process_audio to accept recorded audio and return
structured JSON for the selected language.

Run with: python serum_stt_server.py
"""
import os
import sys
import tempfile
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename

from serum_client import process_audio_file
from langchain_analyzer import analyze_complaint_with_langchain
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/process_audio", methods=["POST", "OPTIONS"])
def process_audio():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})
    if "audio" not in request.files:
        print("[STT Server] ERROR: no 'audio' key in request.files", flush=True)
        return jsonify({"error": "no audio file provided"}), 400

    f = request.files["audio"]
    if f.filename == "":
        print("[STT Server] ERROR: empty filename", flush=True)
        return jsonify({"error": "empty filename"}), 400

    filename = secure_filename(f.filename)
    save_path = os.path.join(UPLOAD_DIR, filename)
    f.save(save_path)

    file_size = os.path.getsize(save_path) if os.path.exists(save_path) else 0
    selected_language = request.form.get("selected_language") or request.form.get("language")
    print(f"[STT Server] Received: {filename} ({file_size} bytes), language={selected_language}", flush=True)

    if file_size == 0:
        print("[STT Server] ERROR: saved file is 0 bytes", flush=True)
        return jsonify({"error": "uploaded audio file is empty (0 bytes)"}), 400

    try:
        result = process_audio_file(save_path, selected_language=selected_language)
        print(f"[STT Server] Result: {result}", flush=True)
    except Exception as e:
        print(f"[STT Server] EXCEPTION in process_audio_file: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

    return jsonify(result)

@app.route("/analyze_complaint", methods=["POST", "OPTIONS"])
def analyze_complaint():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
        
    transcript = data.get("transcript", "")
    location = data.get("location", {})
    image_base64 = data.get("image", None)
    
    lat = location.get("lat", 0.0)
    lng = location.get("lng", 0.0)
    address = location.get("address", "")
    
    try:
        analysis_result = analyze_complaint_with_langchain(transcript, lat, lng, address)
        # pass the image back to the frontend so it can be submitted later if needed
        analysis_result["image"] = image_base64
        return jsonify(analysis_result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print(f"[STT Server] Starting on http://127.0.0.1:8090", flush=True)
    print(f"[STT Server] Upload dir: {UPLOAD_DIR}", flush=True)
    app.run(host="127.0.0.1", port=8090, debug=False)
