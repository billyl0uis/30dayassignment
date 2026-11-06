# Static dev server that tells the browser never to cache, so edits to ES
# modules show up on a plain reload. Usage: python3 dev-server.py PORT DIR
import functools
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(("", port), functools.partial(NoCache, directory=root)).serve_forever()
