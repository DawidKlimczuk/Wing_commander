"""Oferta magazynowa i statystyki sprzedaży."""
from __future__ import annotations

from flask import jsonify, request
from sqlalchemy import func, select

from ..extensions import db
from ..models import Client, Hull, MountedWeapon, PurchasedShip, Transaction, Weapon
from . import bp

LOW_STOCK = 2


@bp.get("/inventory")
def inventory():
    """Stan magazynu: co jest na stanie, ile tego jest i ile jest warte."""
    low = request.args.get("low_stock_threshold", default=LOW_STOCK, type=int)
    hulls = db.session.scalars(select(Hull).order_by(Hull.price)).all()
    weapons = db.session.scalars(select(Weapon).order_by(Weapon.kind, Weapon.price)).all()

    def row(item):
        return {"id": item.id, "name": item.name, "price": item.price, "stock": item.stock,
                "value": item.price * item.stock,
                "status": "OUT" if item.stock == 0 else "LOW" if item.stock <= low else "OK"}

    hull_rows = [row(h) for h in hulls]
    weapon_rows = [{**row(w), "kind": w.kind.value} for w in weapons]
    return jsonify(
        hulls=hull_rows,
        weapons=weapon_rows,
        summary={
            "hull_units": sum(h.stock for h in hulls),
            "weapon_units": sum(w.stock for w in weapons),
            "total_value": sum(r["value"] for r in hull_rows + weapon_rows),
            "out_of_stock": [r["name"] for r in hull_rows + weapon_rows if r["status"] == "OUT"],
            "low_stock": [r["name"] for r in hull_rows + weapon_rows if r["status"] == "LOW"],
            "low_stock_threshold": low,
        },
    )


@bp.get("/stats")
def stats():
    s = db.session
    clients = s.scalar(select(func.count(Client.id)))
    transactions = s.scalar(select(func.count(Transaction.id)))
    revenue = s.scalar(select(func.coalesce(func.sum(Transaction.total_price), 0)))
    ships_sold = s.scalar(select(func.count(PurchasedShip.id)))

    by_profession = dict(s.execute(
        select(Client.profession, func.count(Client.id)).group_by(Client.profession)).all())

    hull_sales = s.execute(
        select(Hull.name, func.count(PurchasedShip.id), func.sum(PurchasedShip.hull_price))
        .join(PurchasedShip).group_by(Hull.id).order_by(func.count(PurchasedShip.id).desc())
    ).all()

    weapon_sales = s.execute(
        select(Weapon.name, func.sum(MountedWeapon.quantity))
        .join(MountedWeapon).group_by(Weapon.id).order_by(func.sum(MountedWeapon.quantity).desc())
    ).all()

    top_client = s.execute(
        select(Client.name, func.sum(Transaction.total_price).label("spent"))
        .join(Transaction).group_by(Client.id).order_by(func.sum(Transaction.total_price).desc())
        .limit(1)
    ).first()

    return jsonify(
        clients=clients,
        transactions=transactions,
        ships_sold=ships_sold,
        revenue=revenue,
        average_transaction=round(revenue / transactions) if transactions else 0,
        clients_by_profession={p.value: n for p, n in by_profession.items()},
        hull_sales=[{"hull": n, "sold": c, "revenue": r} for n, c, r in hull_sales],
        weapon_sales=[{"weapon": n, "units": u} for n, u in weapon_sales],
        top_client={"name": top_client[0], "spent": top_client[1]} if top_client else None,
    )
