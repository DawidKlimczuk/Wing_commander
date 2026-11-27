# =======================
# w tym pliku znajdują się funkcje odpowiedzialne za dodawanie, pobieranie, edycję i usuwanie kadłubów, broni i klientów
# =======================
from __future__ import annotations

from flask import jsonify, request, url_for
from sqlalchemy import select

from ..errors import APIError, Conflict, NotFound
from ..extensions import db
from ..models import Client, Hull, MountedWeapon, Profession, PurchasedShip, Weapon, WeaponKind
from ..validation import Field, get_json, validate
from . import bp

# schematy do walidacji danych przy dodawaniu
ACCELERATION = ("Poor", "Average", "Good", "Excellent")

HULL_SCHEMA = {
    "name": Field(str, max_length=64),
    "ship_class": Field(str, required=False, default="", max_length=64),
    "armor_front": Field((int, float), min=0, max=500),
    "armor_rear": Field((int, float), min=0, max=500),
    "armor_side": Field((int, float), min=0, max=500),
    "cargo": Field(int, min=0, max=10_000),
    "max_velocity": Field(int, min=1, max=5_000),
    "afterburner_velocity": Field(int, min=1, max=10_000),
    "acceleration": Field(str, required=False, default="Average", choices=ACCELERATION),
    "gun_slots": Field(int, min=0, max=8),
    "turret_slots": Field(int, required=False, default=0, min=0, max=8),
    "missile_slots": Field(int, min=0, max=8),
    "price": Field(int, min=0),
    "stock": Field(int, required=False, default=0, min=0),
    "description": Field(str, required=False, default="", max_length=500),
}

WEAPON_SCHEMA = {
    "name": Field(str, max_length=64),
    "kind": Field(str, choices=tuple(k.value for k in WeaponKind)),
    "damage": Field((int, float), min=0),
    "ammo": Field(int, required=False, nullable=True, min=1),
    "energy": Field(int, required=False, nullable=True, min=0),
    "refire": Field((int, float), required=False, nullable=True, min=0),
    "speed": Field(int, required=False, nullable=True, min=0),
    "price": Field(int, min=0),
    "stock": Field(int, required=False, default=0, min=0),
}

CLIENT_SCHEMA = {
    "name": Field(str, max_length=64),
    "origin": Field(str, max_length=64),
    "profession": Field(str, choices=tuple(p.value for p in Profession)),
    "credits": Field(int, required=False, default=0, min=0),
}


# ==============
# funkcja pobiera obiekt z bazy po id, a jak go nie ma to zwraca błąd 404
# ==============
def get_or_404(model, obj_id: int, label: str):
    obj = db.session.get(model, obj_id)
    if obj is None:
        raise NotFound(f"{label} o id={obj_id} nie istnieje.", details={"id": obj_id})
    return obj


# ==============
# funkcja sprawdza czy nazwa nie jest już zajęta (przy edycji pomijam edytowany obiekt)
# ==============
def ensure_unique_name(model, name: str, label: str, skip_id: int | None = None) -> None:
    query = select(model).where(model.name == name)
    if skip_id is not None:
        query = query.where(model.id != skip_id)
    if db.session.scalar(query) is not None:
        raise Conflict(f"{label} o nazwie '{name}' już istnieje.", details={"name": name})


# ==============
# funkcja zwraca dane z żądania - dla PUT wszystkie pola, dla PATCH tylko te co przyszły
# ==============
def update_data(schema: dict) -> dict:
    return validate(get_json(), schema, partial=request.method == "PATCH")


# ==============
# funkcja przepisuje nowe wartości do obiektu i zapisuje go w bazie
# ==============
def save_changes(obj, data: dict):
    for key, value in data.items():
        setattr(obj, key, value)
    db.session.commit()
    return jsonify(obj.to_dict())


# ==============
# funkcja sprawdza czy dopalacz nie jest wolniejszy od zwykłej prędkości
# ==============
def check_velocity(max_velocity: int, afterburner_velocity: int) -> None:
    if afterburner_velocity < max_velocity:
        raise APIError("Prędkość z dopalaczem nie może być mniejsza od prędkości maksymalnej.",
                       status=422, code="VALIDATION_ERROR",
                       details={"fields": {"afterburner_velocity": "Musi być >= max_velocity."}})


# ==============
# funkcja usuwa obiekt i zwraca w JSON-ie to co zostało usunięte
# ==============
def deleted(obj, label: str):
    data = obj.to_dict()
    db.session.delete(obj)
    db.session.commit()
    return jsonify(message=f"{label} '{data['name']}' został usunięty.", deleted=data)


# ==============
# funkcja zwraca odpowiedź 201 po dodaniu nowego obiektu
# ==============
def created(obj, endpoint: str):
    resp = jsonify(obj.to_dict())
    resp.status_code = 201
    resp.headers["Location"] = url_for(endpoint, obj_id=obj.id)
    return resp


# ==============
# funkcje odpowiedzialne za kadłuby (lista, jeden kadłub, dodanie, usunięcie)
# ==============
@bp.get("/hulls")
def list_hulls():
    query = select(Hull).order_by(Hull.price)
    if request.args.get("in_stock") in ("1", "true"):
        query = query.where(Hull.stock > 0)
    return jsonify([h.to_dict() for h in db.session.scalars(query)])


@bp.get("/hulls/<int:obj_id>")
def get_hull(obj_id: int):
    return jsonify(get_or_404(Hull, obj_id, "Kadłub").to_dict())


@bp.post("/hulls")
def create_hull():
    data = validate(get_json(), HULL_SCHEMA)
    check_velocity(data["max_velocity"], data["afterburner_velocity"])
    ensure_unique_name(Hull, data["name"], "Kadłub")
    hull = Hull(**data)
    db.session.add(hull)
    db.session.commit()
    return created(hull, "api.get_hull")


# PUT podmienia cały kadłub, PATCH tylko wybrane pola (np. sam stan magazynowy)
@bp.route("/hulls/<int:obj_id>", methods=["PUT", "PATCH"])
def update_hull(obj_id: int):
    hull = get_or_404(Hull, obj_id, "Kadłub")
    data = update_data(HULL_SCHEMA)
    check_velocity(data.get("max_velocity", hull.max_velocity),
                   data.get("afterburner_velocity", hull.afterburner_velocity))
    if "name" in data:
        ensure_unique_name(Hull, data["name"], "Kadłub", skip_id=hull.id)
    return save_changes(hull, data)


@bp.delete("/hulls/<int:obj_id>")
def delete_hull(obj_id: int):
    hull = get_or_404(Hull, obj_id, "Kadłub")
    sold = db.session.scalar(select(db.func.count()).where(PurchasedShip.hull_id == hull.id))
    if sold:
        raise Conflict(f"Nie można usunąć kadłuba '{hull.name}' - figuruje w {sold} transakcjach.",
                       details={"id": hull.id, "sold": sold})
    return deleted(hull, "Kadłub")


# ==============
# funkcje odpowiedzialne za broń (lista, jedna broń, dodanie, usunięcie)
# ==============
@bp.get("/weapons")
def list_weapons():
    query = select(Weapon).order_by(Weapon.kind, Weapon.price)
    kind = request.args.get("kind")
    if kind:
        if kind not in {k.value for k in WeaponKind}:
            raise APIError(f"Nieznany rodzaj broni: '{kind}'.", code="BAD_FILTER",
                           details={"allowed": [k.value for k in WeaponKind]})
        query = query.where(Weapon.kind == WeaponKind(kind))
    return jsonify([w.to_dict() for w in db.session.scalars(query)])


@bp.get("/weapons/<int:obj_id>")
def get_weapon(obj_id: int):
    return jsonify(get_or_404(Weapon, obj_id, "Broń").to_dict())


@bp.post("/weapons")
def create_weapon():
    data = validate(get_json(), WEAPON_SCHEMA)
    kind = WeaponKind(data["kind"])
    if kind is WeaponKind.MISSILE and not data.get("ammo"):
        raise APIError("Rakiety muszą mieć określoną amunicję (ammo).", status=422,
                       code="VALIDATION_ERROR", details={"fields": {"ammo": "Wymagane dla rakiet."}})
    if kind is WeaponKind.ENERGY:
        data["ammo"] = None  # broń energetyczna nie ma amunicji
    ensure_unique_name(Weapon, data["name"], "Broń")
    weapon = Weapon(**{**data, "kind": kind})
    db.session.add(weapon)
    db.session.commit()
    return created(weapon, "api.get_weapon")


@bp.route("/weapons/<int:obj_id>", methods=["PUT", "PATCH"])
def update_weapon(obj_id: int):
    weapon = get_or_404(Weapon, obj_id, "Broń")
    data = update_data(WEAPON_SCHEMA)
    kind = WeaponKind(data.get("kind", weapon.kind.value))
    # nie zmieniam rodzaju broni która już siedzi na sprzedanych statkach
    if kind is not weapon.kind:
        used = db.session.scalar(select(db.func.count()).where(MountedWeapon.weapon_id == weapon.id))
        if used:
            raise Conflict(f"Nie można zmienić rodzaju broni '{weapon.name}' - zamontowano ją na {used} statkach.",
                           details={"id": weapon.id, "mounted": used})
    ammo = data["ammo"] if "ammo" in data else weapon.ammo
    if kind is WeaponKind.MISSILE and not ammo:
        raise APIError("Rakiety muszą mieć określoną amunicję (ammo).", status=422,
                       code="VALIDATION_ERROR", details={"fields": {"ammo": "Wymagane dla rakiet."}})
    if kind is WeaponKind.ENERGY:
        data["ammo"] = None
    if "name" in data:
        ensure_unique_name(Weapon, data["name"], "Broń", skip_id=weapon.id)
    data["kind"] = kind
    return save_changes(weapon, data)


@bp.delete("/weapons/<int:obj_id>")
def delete_weapon(obj_id: int):
    weapon = get_or_404(Weapon, obj_id, "Broń")
    used = db.session.scalar(select(db.func.count()).where(MountedWeapon.weapon_id == weapon.id))
    if used:
        raise Conflict(f"Nie można usunąć broni '{weapon.name}' - zamontowano ją na {used} statkach.",
                       details={"id": weapon.id, "mounted": used})
    return deleted(weapon, "Broń")


# ==============
# funkcje odpowiedzialne za klientów (lista, jeden klient, dodanie, usunięcie)
# ==============
@bp.get("/clients")
def list_clients():
    query = select(Client).order_by(Client.name)
    profession = request.args.get("profession")
    if profession:
        if profession not in {p.value for p in Profession}:
            raise APIError(f"Nieznana profesja: '{profession}'.", code="BAD_FILTER",
                           details={"allowed": [p.value for p in Profession]})
        query = query.where(Client.profession == Profession(profession))
    return jsonify([c.to_dict() for c in db.session.scalars(query)])


@bp.get("/clients/<int:obj_id>")
def get_client(obj_id: int):
    client = get_or_404(Client, obj_id, "Klient")
    return jsonify({**client.to_dict(),
                    "history": [t.to_dict() for t in client.transactions]})


@bp.post("/clients")
def create_client():
    data = validate(get_json(), CLIENT_SCHEMA)
    client = Client(**{**data, "profession": Profession(data["profession"])})
    db.session.add(client)
    db.session.commit()
    return created(client, "api.get_client")


@bp.route("/clients/<int:obj_id>", methods=["PUT", "PATCH"])
def update_client(obj_id: int):
    client = get_or_404(Client, obj_id, "Klient")
    data = update_data(CLIENT_SCHEMA)
    if "profession" in data:
        data["profession"] = Profession(data["profession"])
    return save_changes(client, data)


@bp.delete("/clients/<int:obj_id>")
def delete_client(obj_id: int):
    client = get_or_404(Client, obj_id, "Klient")
    if client.transactions:
        raise Conflict(f"Klient '{client.name}' ma historię transakcji - nie można go usunąć.",
                       details={"id": client.id, "transactions": len(client.transactions)})
    return deleted(client, "Klient")
