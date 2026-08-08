from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 8000

if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), SimpleHTTPRequestHandler)
    print(f"Serving frontend at http://{HOST}:{PORT}")
    print("Open that URL in your browser instead of using file://")
    server.serve_forever()
