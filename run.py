# =======================
# w tym pliku jest start serwera API - uruchamiam go komendą python run.py
# =======================
# python run.py           -> http://127.0.0.1:5000
# python run.py --https   -> https://127.0.0.1:5000 (certyfikat robiony w locie, przeglądarka ostrzeże)
# jak są ustawione SSL_CERT i SSL_KEY to biorę własny certyfikat (np. zrobiony przez mkcert)
import os
import sys

from app import create_app

app = create_app()

if __name__ == "__main__":
    ssl = None
    if os.environ.get("SSL_CERT") and os.environ.get("SSL_KEY"):
        ssl = (os.environ["SSL_CERT"], os.environ["SSL_KEY"])
    elif "--https" in sys.argv:
        ssl = "adhoc"
    app.run(debug=True, port=5000, ssl_context=ssl)
