import pytest

from app import create_app
from app.extensions import db


@pytest.fixture
def client():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
    with app.test_client() as c:
        yield c
    with app.app_context():
        db.drop_all()


def hull_id(client, name):
    return next(h["id"] for h in client.get("/api/hulls").json if h["name"] == name)


def weapon_id(client, name):
    return next(w["id"] for w in client.get("/api/weapons").json if w["name"] == name)


def client_id(client, name):
    return next(c["id"] for c in client.get("/api/clients").json if c["name"] == name)


# ------------------------------------------------------------------ CRUD
def test_list_hulls_returns_seeded_catalog(client):
    r = client.get("/api/hulls")
    assert r.status_code == 200
    assert [h["name"] for h in r.json] == ["Tarsus", "Galaxy", "Orion", "Centurion"]
    centurion = r.json[-1]
    assert centurion["engine"]["afterburner_velocity"] == 1000
    assert centurion["slots"]["total"] == 8


def test_create_get_delete_hull(client):
    payload = {"name": "Drayman", "armor_front": 30, "armor_rear": 30, "armor_side": 20,
               "cargo": 300, "max_velocity": 250, "afterburner_velocity": 400,
               "gun_slots": 1, "missile_slots": 0, "price": 90000, "stock": 1}
    r = client.post("/api/hulls", json=payload)
    assert r.status_code == 201
    assert r.headers["Location"].endswith(f"/api/hulls/{r.json['id']}")
    assert client.get(r.headers["Location"]).json["name"] == "Drayman"
    d = client.delete(f"/api/hulls/{r.json['id']}")
    assert d.status_code == 200 and d.is_json
    assert d.json["deleted"]["name"] == "Drayman"
    assert client.get(f"/api/hulls/{r.json['id']}").status_code == 404


def test_create_weapon_energy_ignores_ammo(client):
    r = client.post("/api/weapons", json={"name": "Fusion Cannon", "kind": "energy",
                                          "damage": 6.6, "ammo": 99, "price": 100000})
    assert r.status_code == 201
    assert r.json["ammo"] is None


def test_missile_requires_ammo(client):
    r = client.post("/api/weapons", json={"name": "Mine", "kind": "missile", "damage": 50, "price": 10})
    assert r.status_code == 422
    assert "ammo" in r.json["error"]["details"]["fields"]


def test_filter_weapons_by_kind(client):
    r = client.get("/api/weapons?kind=missile")
    assert r.status_code == 200 and all(w["kind"] == "missile" for w in r.json)
    assert client.get("/api/weapons?kind=banana").status_code == 400


def test_create_and_delete_client(client):
    r = client.post("/api/clients", json={"name": "Brownbeard", "origin": "Achilles",
                                          "profession": "pirate", "credits": 5000})
    assert r.status_code == 201
    d = client.delete(f"/api/clients/{r.json['id']}")
    assert d.status_code == 200 and d.json["deleted"]["name"] == "Brownbeard"


def test_delete_weapon_returns_json(client):
    w = client.post("/api/weapons", json={"name": "Fusion Cannon", "kind": "energy", "damage": 6.6, "price": 100000})
    d = client.delete(f"/api/weapons/{w.json['id']}")
    assert d.status_code == 200 and d.json["deleted"]["kind"] == "energy"
    assert "message" in d.json


def test_every_endpoint_answers_in_json(client):
    """Wymaganie z PDF: dane zwracane w formacie JSON - także przy błędach i usuwaniu."""
    new = client.post("/api/clients", json={"name": "X", "origin": "Oxford", "profession": "trader"})
    responses = [
        client.get("/api/"), client.get("/api/hulls"), client.get("/api/hulls/1"),
        client.get("/api/weapons"), client.get("/api/clients"), client.get("/api/purchases"),
        client.get("/api/inventory"), client.get("/api/stats"), new,
        client.delete(f"/api/clients/{new.json['id']}"),
        client.get("/api/nope"), client.put("/api/hulls"), client.get("/api/hulls/999"),
    ]
    for r in responses:
        assert r.is_json, (r.request.path, r.status_code)


# ------------------------------------------------------------------ BŁĘDY
def test_validation_collects_all_field_errors(client):
    r = client.post("/api/clients", json={"name": "", "profession": "jedi", "credits": -5, "x": 1})
    assert r.status_code == 422
    fields = r.json["error"]["details"]["fields"]
    assert set(fields) == {"name", "origin", "profession", "credits", "x"}


def test_bool_is_not_accepted_as_int(client):
    r = client.post("/api/clients", json={"name": "A", "origin": "B", "profession": "trader",
                                          "credits": True})
    assert r.status_code == 422


def test_non_json_body(client):
    r = client.post("/api/clients", data="name=x", content_type="application/x-www-form-urlencoded")
    assert r.status_code == 415
    assert r.json["error"]["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_malformed_json(client):
    r = client.post("/api/clients", data="{oops", content_type="application/json")
    assert r.status_code == 400
    assert r.json["error"]["code"] == "MALFORMED_JSON"


def test_unknown_route_and_method_are_json(client):
    r = client.get("/api/kilrathi")
    assert r.status_code == 404 and r.json["error"]["code"] == "NOT_FOUND"
    r = client.put("/api/hulls")
    assert r.status_code == 405 and "GET" in r.json["error"]["details"]["allowed"]


def test_duplicate_name_conflict(client):
    r = client.post("/api/weapons", json={"name": "Laser", "kind": "energy", "damage": 1, "price": 1})
    assert r.status_code == 409


def test_cannot_delete_sold_hull_or_client_with_history(client):
    assert client.delete(f"/api/hulls/{hull_id(client, 'Centurion')}").status_code == 409
    assert client.delete(f"/api/clients/{client_id(client, 'Tayla')}").status_code == 409


# ------------------------------------------------------------------ ZAKUP
def order(client, who, hull, loadout=(), callsign="Test"):
    return client.post("/api/purchases", json={
        "client_id": client_id(client, who),
        "ships": [{"hull_id": hull_id(client, hull), "callsign": callsign,
                   "loadout": [{"weapon_id": weapon_id(client, w), "mount": m, "quantity": q}
                               for w, m, q in loadout]}],
    })


def test_purchase_updates_stock_credits_and_stats(client):
    before_stats = client.get("/api/stats").json
    galaxy_stock = client.get(f"/api/hulls/{hull_id(client, 'Galaxy')}").json["stock"]

    r = order(client, "Grayson Burrows", "Galaxy",
              [("Mass Driver", "gun", 2), ("Laser", "turret", 1), ("Dumbfire Missile", "missile", 1)])
    assert r.status_code == 201, r.json
    expected = 60000 + 2 * 1500 + 1000 + 200
    assert r.json["total_price"] == expected
    assert r.json["client_credits_left"] == 75000 - expected
    assert r.json["ships"][0]["loadout"][0]["weapon"]["name"] == "Mass Driver"

    assert client.get(f"/api/hulls/{hull_id(client, 'Galaxy')}").json["stock"] == galaxy_stock - 1
    after = client.get("/api/stats").json
    assert after["transactions"] == before_stats["transactions"] + 1
    assert after["revenue"] == before_stats["revenue"] + expected
    assert client.get(r.headers["Location"]).json["id"] == r.json["id"]


def test_purchase_multiple_ships(client):
    tarsus = hull_id(client, "Tarsus")
    r = client.post("/api/purchases", json={
        "client_id": client_id(client, "Tayla"),
        "ships": [{"hull_id": tarsus}, {"hull_id": tarsus, "callsign": "Drugi"}]})
    assert r.status_code == 201
    assert len(r.json["ships"]) == 2


def test_purchase_insufficient_credits_is_atomic(client):
    stock_before = client.get("/api/inventory").json
    r = order(client, "Sandoval", "Centurion")
    assert r.status_code == 402
    assert r.json["error"]["details"]["missing"] == 150000 - 15000
    assert client.get("/api/inventory").json == stock_before


def test_purchase_slot_limit(client):
    r = order(client, "Tayla", "Tarsus", [("Laser", "gun", 3)])
    assert r.status_code == 422 and r.json["error"]["code"] == "SLOT_LIMIT_EXCEEDED"


def test_purchase_incompatible_mount(client):
    r = order(client, "Tayla", "Orion", [("Proton Torpedo", "gun", 1)])
    assert r.status_code == 422 and r.json["error"]["code"] == "INCOMPATIBLE_MOUNT"


def test_purchase_tarsus_has_no_turret(client):
    r = order(client, "Tayla", "Tarsus", [("Laser", "turret", 1)])
    assert r.status_code == 422 and r.json["error"]["code"] == "SLOT_LIMIT_EXCEEDED"


def test_purchase_out_of_stock(client):
    # Plasma Gun: 2 sztuki na stanie, kupujemy 2 Centuriony po 2 działa
    centurion, plasma = hull_id(client, "Centurion"), weapon_id(client, "Plasma Gun")
    ship = {"hull_id": centurion, "loadout": [{"weapon_id": plasma, "mount": "gun", "quantity": 2}]}
    client.post("/api/clients", json={"name": "Bogacz", "origin": "Oxford",
                                      "profession": "trader", "credits": 10_000_000})
    r = client.post("/api/purchases", json={"client_id": client_id(client, "Bogacz"),
                                            "ships": [ship, ship]})
    assert r.status_code == 409 and r.json["error"]["code"] == "OUT_OF_STOCK"
    names = {s["name"] for s in r.json["error"]["details"]["shortages"]}
    assert names == {"Centurion", "Plasma Gun"}


def test_purchase_nested_validation_paths(client):
    r = client.post("/api/purchases", json={"client_id": 1, "ships": [
        {"hull_id": 1, "loadout": [{"weapon_id": "x", "mount": "nose"}]}]})
    assert r.status_code == 422
    fields = r.json["error"]["details"]["fields"]
    assert "ships[0].loadout[0].weapon_id" in fields and "ships[0].loadout[0].mount" in fields


def test_purchase_unknown_client(client):
    r = client.post("/api/purchases", json={"client_id": 999, "ships": [{"hull_id": 1}]})
    assert r.status_code == 404


def test_purchase_empty_order(client):
    assert client.post("/api/purchases", json={"client_id": 1, "ships": []}).status_code == 422


# ------------------------------------------------------------------ MAGAZYN / STATYSTYKI
def test_inventory_summary(client):
    r = client.get("/api/inventory")
    assert r.status_code == 200
    inv = r.json
    assert inv["summary"]["hull_units"] == sum(h["stock"] for h in inv["hulls"])
    assert all(row["status"] in ("OK", "LOW", "OUT") for row in inv["hulls"] + inv["weapons"])


def test_stats(client):
    s = client.get("/api/stats").json
    assert s["clients"] == 6
    assert s["transactions"] == 3
    assert s["top_client"]["name"] == "Tayla"
    assert sum(s["clients_by_profession"].values()) == 6
