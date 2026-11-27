# =======================
# w tym pliku znajduje się funkcja tworząca aplikację Flask (konfiguracja, baza, trasy)
# =======================
# Flask jest tu tylko serwerem REST (JSON), wygląd robi aplikacja React z folderu frontend/
# po zbudowaniu Reacta (npm run build) Flask podaje też gotowe pliki z frontend/dist
import mimetypes
import os

from flask import Flask, abort, jsonify, redirect, request, send_from_directory
from sqlalchemy import select
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import safe_join

from .errors import register_error_handlers
from .extensions import db

# na windowsie pliki .js czasem idą jako text/plain i przeglądarka ich nie odpala, to to naprawia
mimetypes.add_type("application/javascript", ".js")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# adresy z których React może pytać API (serwer deweloperski Vite)
DEFAULT_CORS = "http://localhost:5173,http://127.0.0.1:5173,https://localhost:5173,https://127.0.0.1:5173"

# nagłówki bezpieczeństwa dodawane do każdej odpowiedzi
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
        "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
    ),
}


# ==============
# funkcja odpowiedzialna za utworzenie i skonfigurowanie aplikacji
# ==============
def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True, static_folder=None)
    os.makedirs(app.instance_path, exist_ok=True)
    app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///" + os.path.join(app.instance_path, "gemini.db"),
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=64 * 1024,
        SEED_DATABASE=True,
        FRONTEND_DIST=os.path.join(ROOT, "frontend", "dist"),
        CORS_ORIGINS=[o.strip() for o in os.environ.get("CORS_ORIGINS", DEFAULT_CORS).split(",") if o.strip()],
        # na serwerze (Render) ustawiam FORCE_HTTPS=1 i wtedy http jest przekierowane na https
        FORCE_HTTPS=os.environ.get("FORCE_HTTPS") == "1",
    )
    if config:
        app.config.update(config)
    app.json.sort_keys = False
    app.json.ensure_ascii = False

    # Render stoi przed aplikacją jako proxy - dzięki temu Flask wie że połączenie było po https
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    db.init_app(app)
    register_error_handlers(app)

    from .api import bp as api_bp
    app.register_blueprint(api_bp)

    # przekierowanie z http na https (308 zostawia metodę, więc POST dalej jest POST-em)
    @app.before_request
    def force_https():
        if app.config["FORCE_HTTPS"] and not request.is_secure:
            return redirect(request.url.replace("http://", "https://", 1), code=308)

    # dopisuję nagłówki CORS i bezpieczeństwa do odpowiedzi
    @app.after_request
    def add_headers(resp):
        origin = request.headers.get("Origin")
        if request.path.startswith("/api") and origin in app.config["CORS_ORIGINS"]:
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
            resp.headers["Access-Control-Expose-Headers"] = "Location"
            resp.headers["Vary"] = "Origin"
        for key, value in SECURITY_HEADERS.items():
            resp.headers.setdefault(key, value)
        if request.is_secure:
            resp.headers["Strict-Transport-Security"] = "max-age=31536000"
        return resp

    # strona główna i reszta adresów - zwracam zbudowanego Reacta
    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path):
        if path == "api" or path.startswith("api/"):
            abort(404)
        dist = app.config["FRONTEND_DIST"]
        file = safe_join(dist, path) if path else None
        if file and os.path.isfile(file):
            return send_from_directory(dist, path)
        if os.path.isfile(os.path.join(dist, "index.html")):
            return send_from_directory(dist, "index.html")
        return jsonify(message="Frontend nie jest zbudowany. Wejdź do folderu frontend i odpal "
                               "'npm run dev' (albo 'npm run build').", api="/api/"), 503

    # tworzę tabele i jak baza jest pusta to wrzucam dane startowe
    with app.app_context():
        db.create_all()
        if app.config["SEED_DATABASE"]:
            from .models import Hull
            from .seed import seed_database
            if db.session.scalar(select(Hull).limit(1)) is None:
                seed_database()

    return app
