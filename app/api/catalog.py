"""CRUD: kadłuby, broń, klienci (GET / POST / DELETE)."""
from __future__ import annotations

from flask import jsonify, request, url_for
from sqlalchemy import select

from ..errors import APIError, Conflict, NotFound
from ..extensions import db
from ..models import Client, Hull, MountedWeapon, Profession, PurchasedShip, Weapon, WeaponKind
from ..validation import Field, get_json, validate
from . import bp

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


def get_or_404(model, obj_id: int, label: str):
    obj = db.session.get(model, obj_id)
    if obj is None:
        raise NotFound(f"{label} o id={obj_id} nie istnieje.", details={"id": obj_id})
    return obj


def ensure_unique_name(model, name: str, label: str) -> None:
    if db.session.scalar(select(model).where(model.name == name)) is not None:
        raise Conflict(f"{label} o nazwie '{name}' już istnieje.", details={"name": name})


def deleted(obj, label: str):
    """Usuwa obiekt i zwraca jego ostatni stan w JSON (200), żeby klient wiedział, co zniknęło."""
    data = obj.to_dict()
    db.session.delete(obj)
    db.session.commit()
    return jsonify(message=f"{label} '{data['name']}' został usunięty.", deleted=data)


def created(obj, endpoint: str):
    resp = jsonify(obj.to_dict())
    resp.status_code = 201
    resp.headers["Location"] = url_for(endpoint, obj_id=obj.id)
    return resp


# ------------------------------------------------------------------ KADŁUBY
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
    if data["afterburner_velocity"] < data["max_velocity"]:
        raise APIError("Prędkość z dopalaczem nie może być mniejsza od prędkości maksymalnej.",
                       status=422, code="VALIDATION_ERROR",
                       details={"fields": {"afterburner_velocity": "Musi być >= max_velocity."}})
    ensure_unique_name(Hull, data["name"], "Kadłub")
    hull = Hull(**data)
    db.session.add(hull)
    db.session.commit()
    return created(hull, "api.get_hull")


@bp.delete("/hulls/<int:obj_id>")
def delete_hull(obj_id: int):
    hull = get_or_404(Hull, obj_id, "Kadłub")
    sold = db.session.scalar(select(db.func.count()).where(PurchasedShip.hull_id == hull.id))
    if sold:
        raise Conflict(f"Nie można usunąć kadłuba '{hull.name}' - figuruje w {sold} transakcjach.",
                       details={"id": hull.id, "sold": sold})
    return deleted(hull, "Kadłub")


# ------------------------------------------------------------------ BROŃ
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
        data["ammo"] = None  # broń energetyczna zasilana jest z generatora
    ensure_unique_name(Weapon, data["name"], "Broń")
    weapon = Weapon(**{**data, "kind": kind})
    db.session.add(weapon)
    db.session.commit()
    return created(weapon, "api.get_weapon")


@bp.delete("/weapons/<int:obj_id>")
def delete_weapon(obj_id: int):
    weapon = get_or_404(Weapon, obj_id, "Broń")
    used = db.session.scalar(select(db.func.count()).where(MountedWeapon.weapon_id == weapon.id))
    if used:
        raise Conflict(f"Nie można usunąć broni '{weapon.name}' - zamontowano ją na {used} statkach.",
                       details={"id": weapon.id, "mounted": used})
    return deleted(weapon, "Broń")


# ------------------------------------------------------------------ KLIENCI
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


@bp.delete("/clients/<int:obj_id>")
def delete_client(obj_id: int):
    client = get_or_404(Client, obj_id, "Klient")
    if client.transactions:
        raise Conflict(f"Klient '{client.name}' ma historię transakcji - nie można go usunąć.",
                       details={"id": client.id, "transactions": len(client.transactions)})
    return deleted(client, "Klient")
