from flask import Blueprint, jsonify, url_for

bp = Blueprint("api", __name__, url_prefix="/api")

from . import catalog, stats, trade  # noqa: E402,F401  (rejestracja tras)


@bp.get("/")
def index():
    """Spis dostępnych punktów końcowych - przydatny w terminalu."""
    return jsonify(
        service="Gemini Sector Ship Dealer API",
        author="Dawid Klimczuk",
        endpoints={
            "hulls": {"GET": url_for("api.list_hulls"), "POST": url_for("api.create_hull"),
                      "GET/DELETE one": "/api/hulls/<id>"},
            "weapons": {"GET": url_for("api.list_weapons"), "POST": url_for("api.create_weapon"),
                        "GET/DELETE one": "/api/weapons/<id>"},
            "clients": {"GET": url_for("api.list_clients"), "POST": url_for("api.create_client"),
                        "GET/DELETE one": "/api/clients/<id>"},
            "purchases": {"GET": url_for("api.list_purchases"), "POST": url_for("api.purchase"),
                          "GET one": "/api/purchases/<id>"},
            "inventory": {"GET": url_for("api.inventory")},
            "stats": {"GET": url_for("api.stats")},
        },
    )
