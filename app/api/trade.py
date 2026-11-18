# =======================
# w tym pliku znajdują się funkcje odpowiedzialne za kupowanie statków (sklep)
# =======================
"""
Przykładowe żądanie:

    POST /api/purchases
    {
      "client_id": 1,
      "ships": [
        {
          "hull_id": 4,
          "callsign": "Szara Eminencja",
          "loadout": [
            {"weapon_id": 6, "mount": "gun", "quantity": 2},
            {"weapon_id": 11, "mount": "missile", "quantity": 1}
          ]
        }
      ]
    }

Zakup jest robiony w całości albo wcale - jak coś się nie zgadza
to nie zmienia się ani magazyn ani kredyty klienta.
"""
from __future__ import annotations

from collections import Counter

from flask import jsonify, request, url_for
from sqlalchemy import select

from ..errors import APIError, InsufficientCredits, OutOfStock, ValidationError
from ..extensions import db
from ..models import (MOUNT_ACCEPTS, Client, Hull, Mount, MountedWeapon, PurchasedShip,
                      Transaction, Weapon)
from ..validation import Field, get_json, validate
from . import bp
from .catalog import get_or_404

MAX_SHIPS_PER_ORDER = 10


# ==============
# funkcja zamienia liczbę na kwotę typu '150 000 kr'
# ==============
def kr(amount: int) -> str:
    return f"{amount:,} kr".replace(",", " ")


# schematy do sprawdzania zamówienia
PURCHASE_SCHEMA = {
    "client_id": Field(int, min=1),
    "ships": Field(list),
}
SHIP_SCHEMA = {
    "hull_id": Field(int, min=1),
    "callsign": Field(str, required=False, default="", max_length=64),
    "loadout": Field(list, required=False, default=[]),
}
LOADOUT_SCHEMA = {
    "weapon_id": Field(int, min=1),
    "mount": Field(str, choices=tuple(m.value for m in Mount)),
    "quantity": Field(int, required=False, default=1, min=1, max=8),
}


# ==============
# funkcja sprawdza listę obiektów w zamówieniu (błędy mają ścieżkę np. ships[0].loadout[1])
# ==============
def _validate_nested(items: list, schema: dict, path: str) -> list[dict]:
    result, errors = [], {}
    for i, item in enumerate(items):
        where = f"{path}[{i}]"
        if not isinstance(item, dict):
            errors[where] = "Oczekiwano obiektu."
            continue
        try:
            result.append(validate(item, schema))
        except ValidationError as err:
            for field, msg in err.details["fields"].items():
                errors[f"{where}.{field}"] = msg
    if errors:
        raise ValidationError("Niepoprawna specyfikacja zamówienia.", details={"fields": errors})
    return result


# ==============
# funkcja odpowiedzialna za zakup statków (sklep)
# ==============
@bp.post("/purchases")
def purchase():
    data = validate(get_json(), PURCHASE_SCHEMA)
    ships = _validate_nested(data["ships"], SHIP_SCHEMA, "ships")
    if not ships:
        raise ValidationError("Zamówienie musi zawierać przynajmniej jeden statek.",
                              details={"fields": {"ships": "Lista nie może być pusta."}})
    if len(ships) > MAX_SHIPS_PER_ORDER:
        raise ValidationError(f"Maksymalnie {MAX_SHIPS_PER_ORDER} statków w jednym zamówieniu.",
                              details={"fields": {"ships": "Za dużo pozycji."}})
    for i, ship in enumerate(ships):
        ship["loadout"] = _validate_nested(ship["loadout"], LOADOUT_SCHEMA, f"ships[{i}].loadout")

    client = get_or_404(Client, data["client_id"], "Klient")

    # 1. sprawdzam czy bronie pasują do slotów i czy jest ich nie za dużo
    hull_demand: Counter[int] = Counter()
    weapon_demand: Counter[int] = Counter()
    hulls: dict[int, Hull] = {}
    weapons: dict[int, Weapon] = {}

    for i, ship in enumerate(ships):
        hull = hulls.get(ship["hull_id"]) or get_or_404(Hull, ship["hull_id"], "Kadłub")
        hulls[hull.id] = hull
        hull_demand[hull.id] += 1

        used: Counter[Mount] = Counter()
        for j, item in enumerate(ship["loadout"]):
            weapon = weapons.get(item["weapon_id"]) or get_or_404(Weapon, item["weapon_id"], "Broń")
            weapons[weapon.id] = weapon
            mount = Mount(item["mount"])
            if MOUNT_ACCEPTS[mount] is not weapon.kind:
                raise APIError(
                    f"{weapon.name} ({weapon.kind.value}) nie pasuje do slotu typu '{mount.value}'.",
                    status=422, code="INCOMPATIBLE_MOUNT",
                    details={"ship": i, "item": j, "weapon": weapon.name, "mount": mount.value})
            used[mount] += item["quantity"]
            weapon_demand[weapon.id] += item["quantity"]

        for mount, count in used.items():
            if count > hull.slots_for(mount):
                raise APIError(
                    f"{hull.name} ma tylko {hull.slots_for(mount)} slot(y) typu '{mount.value}', "
                    f"a próbujesz zamontować {count}.",
                    status=422, code="SLOT_LIMIT_EXCEEDED",
                    details={"ship": i, "hull": hull.name, "mount": mount.value,
                             "available": hull.slots_for(mount), "requested": count})

    # 2. sprawdzam czy jest tyle towaru w magazynie
    shortages = [
        {"type": "hull", "id": h_id, "name": hulls[h_id].name,
         "requested": n, "in_stock": hulls[h_id].stock}
        for h_id, n in hull_demand.items() if hulls[h_id].stock < n
    ] + [
        {"type": "weapon", "id": w_id, "name": weapons[w_id].name,
         "requested": n, "in_stock": weapons[w_id].stock}
        for w_id, n in weapon_demand.items() if weapons[w_id].stock < n
    ]
    if shortages:
        raise OutOfStock("Brak wystarczającej ilości towaru w magazynie.",
                         details={"shortages": shortages})

    # 3. sprawdzam czy klienta stać
    total = sum(hulls[h].price * n for h, n in hull_demand.items()) \
        + sum(weapons[w].price * n for w, n in weapon_demand.items())
    if client.credits < total:
        raise InsufficientCredits(
            f"Brak środków. Potrzeba {kr(total)}, a {client.name} ma {kr(client.credits)}.",
            details={"required": total, "available": client.credits,
                     "missing": total - client.credits})

    # 4. zapisuję zakup, zdejmuję towar i kredyty
    transaction = Transaction(client=client, total_price=total)
    for ship in ships:
        hull = hulls[ship["hull_id"]]
        purchased = PurchasedShip(hull=hull, hull_price=hull.price,
                                  callsign=ship["callsign"] or f"{hull.name}-{client.name.split()[0]}")
        for item in ship["loadout"]:
            weapon = weapons[item["weapon_id"]]
            purchased.weapons.append(MountedWeapon(weapon=weapon, mount=Mount(item["mount"]),
                                                   quantity=item["quantity"],
                                                   unit_price=weapon.price))
        transaction.ships.append(purchased)

    for h_id, n in hull_demand.items():
        hulls[h_id].stock -= n
    for w_id, n in weapon_demand.items():
        weapons[w_id].stock -= n
    client.credits -= total

    db.session.add(transaction)
    db.session.commit()

    resp = jsonify({**transaction.to_dict(), "client_credits_left": client.credits})
    resp.status_code = 201
    resp.headers["Location"] = url_for("api.get_purchase", obj_id=transaction.id)
    return resp


# ==============
# funkcja odpowiedzialna za listę zakupów
# ==============
@bp.get("/purchases")
def list_purchases():
    query = select(Transaction).order_by(Transaction.created_at.desc(), Transaction.id.desc())
    client_id = request.args.get("client_id", type=int)
    if client_id is not None:
        query = query.where(Transaction.client_id == client_id)
    return jsonify([t.to_dict() for t in db.session.scalars(query)])


# ==============
# funkcja odpowiedzialna za pokazanie jednego zakupu
# ==============
@bp.get("/purchases/<int:obj_id>")
def get_purchase(obj_id: int):
    return jsonify(get_or_404(Transaction, obj_id, "Transakcja").to_dict())
