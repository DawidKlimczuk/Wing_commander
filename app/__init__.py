import mimetypes
import os

from flask import Flask, render_template
from sqlalchemy import select

from .errors import register_error_handlers
from .extensions import db

# Windows potrafi mieć w rejestrze .js -> text/plain, co psuje moduły ES w przeglądarce
mimetypes.add_type("application/javascript", ".js")


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    os.makedirs(app.instance_path, exist_ok=True)
    app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///" + os.path.join(app.instance_path, "gemini.db"),
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=64 * 1024,
        SEED_DATABASE=True,
    )
    if config:
        app.config.update(config)
    app.json.sort_keys = False
    app.json.ensure_ascii = False

    db.init_app(app)
    register_error_handlers(app)

    from .api import bp as api_bp
    app.register_blueprint(api_bp)

    from .seed import ORIGINS

    @app.get("/")
    def index():
        return render_template("index.html", origins=ORIGINS)

    with app.app_context():
        db.create_all()
        if app.config["SEED_DATABASE"]:
            from .models import Hull
            from .seed import seed_database
            if db.session.scalar(select(Hull).limit(1)) is None:
                seed_database()

    return app
