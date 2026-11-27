# =======================
# w tym pliku tworzę blueprint dla API (wszystkie adresy zaczynają się od /api)
# =======================
from flask import Blueprint, jsonify, url_for

bp = Blueprint("api", __name__, url_prefix="/api")

from . import catalog, stats, trade  # noqa: E402,F401  (import tras)


# ==============
# funkcja odpowiedzialna za wyświetlenie listy wszystkich endpointów
# ==============
@bp.get("/")
def index():
    return jsonify(
        service="Gemini Sector Ship Dealer API",
        author="Dawid Klimczuk",
        endpoints={
            "hulls": {"GET": url_for("api.list_hulls"), "POST": url_for("api.create_hull"),
                      "GET/PUT/PATCH/DELETE one": "/api/hulls/<id>"},
            "weapons": {"GET": url_for("api.list_weapons"), "POST": url_for("api.create_weapon"),
                        "GET/PUT/PATCH/DELETE one": "/api/weapons/<id>"},
            "clients": {"GET": url_for("api.list_clients"), "POST": url_for("api.create_client"),
                        "GET/PUT/PATCH/DELETE one": "/api/clients/<id>"},
            "purchases": {"GET": url_for("api.list_purchases"), "POST": url_for("api.purchase"),
                          "GET one": "/api/purchases/<id>"},
            "inventory": {"GET": url_for("api.inventory")},
            "stats": {"GET": url_for("api.stats")},
            "meta": {"GET": url_for("api.meta")},
        },
    )


# ==============
# funkcja zwraca słowniki potrzebne we frontendzie (pochodzenie, profesje, przyspieszenie itd.)
# ==============
@bp.get("/meta")
def meta():
    from ..models import Mount, Profession, WeaponKind
    from ..seed import ORIGINS
    from .catalog import ACCELERATION
    return jsonify(
        origins=ORIGINS,
        professions=[p.value for p in Profession],
        weapon_kinds=[k.value for k in WeaponKind],
        mounts=[m.value for m in Mount],
        acceleration=list(ACCELERATION),
    )
