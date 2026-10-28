"""Model ORM sklepu ze statkami (Gemini Sector, 2669).

Encje:
    Hull         - kadłub statku (oferta stoczni)
    Weapon       - uzbrojenie (broń energetyczna / rakiety)
    Client       - klient (pilot) sklepu
    Transaction  - transakcja zakupu
    PurchasedShip    - pojedynczy statek kupiony w ramach transakcji
    MountedWeapon    - broń zamontowana na kupionym statku
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class WeaponKind(str, enum.Enum):
    ENERGY = "energy"     # broń energetyczna (zasilana z generatora)
    MISSILE = "missile"   # rakiety / torpedy (ograniczona amunicja)


class Profession(str, enum.Enum):
    TRADER = "trader"
    PIRATE = "pirate"
    MERCENARY = "mercenary"
    BOUNTY_HUNTER = "bounty_hunter"
    SMUGGLER = "smuggler"


class Mount(str, enum.Enum):
    GUN = "gun"           # stałe działo
    TURRET = "turret"     # wieżyczka
    MISSILE = "missile"   # punkt podwieszenia rakiet


# Jaki rodzaj broni pasuje do jakiego typu slotu
MOUNT_ACCEPTS = {
    Mount.GUN: WeaponKind.ENERGY,
    Mount.TURRET: WeaponKind.ENERGY,
    Mount.MISSILE: WeaponKind.MISSILE,
}


class Hull(db.Model):
    __tablename__ = "hulls"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_hull_price"),
        CheckConstraint("stock >= 0", name="ck_hull_stock"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    ship_class: Mapped[str] = mapped_column(String(64), default="")
    # pancerz [cm]
    armor_front: Mapped[float]
    armor_rear: Mapped[float]
    armor_side: Mapped[float]
    # przestrzeń ładunkowa [jednostki]
    cargo: Mapped[int]
    # silnik
    max_velocity: Mapped[int]            # kps
    afterburner_velocity: Mapped[int]    # kps
    acceleration: Mapped[str] = mapped_column(String(16), default="Average")
    # sloty na uzbrojenie
    gun_slots: Mapped[int] = mapped_column(default=0)
    turret_slots: Mapped[int] = mapped_column(default=0)
    missile_slots: Mapped[int] = mapped_column(default=0)
    price: Mapped[int]
    stock: Mapped[int] = mapped_column(default=0)
    description: Mapped[str] = mapped_column(String(500), default="")

    purchases: Mapped[list["PurchasedShip"]] = relationship(back_populates="hull")

    @property
    def weapon_slots(self) -> int:
        return self.gun_slots + self.turret_slots + self.missile_slots

    def slots_for(self, mount: Mount) -> int:
        return {
            Mount.GUN: self.gun_slots,
            Mount.TURRET: self.turret_slots,
            Mount.MISSILE: self.missile_slots,
        }[mount]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "ship_class": self.ship_class,
            "armor": {
                "front": self.armor_front,
                "rear": self.armor_rear,
                "side": self.armor_side,
            },
            "cargo": self.cargo,
            "engine": {
                "max_velocity": self.max_velocity,
                "afterburner_velocity": self.afterburner_velocity,
                "acceleration": self.acceleration,
            },
            "slots": {
                "gun": self.gun_slots,
                "turret": self.turret_slots,
                "missile": self.missile_slots,
                "total": self.weapon_slots,
            },
            "price": self.price,
            "stock": self.stock,
            "description": self.description,
        }


class Weapon(db.Model):
    __tablename__ = "weapons"
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_weapon_price"),
        CheckConstraint("stock >= 0", name="ck_weapon_stock"),
        CheckConstraint("damage >= 0", name="ck_weapon_damage"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    kind: Mapped[WeaponKind] = mapped_column(
        Enum(WeaponKind, values_callable=lambda e: [m.value for m in e], native_enum=False)
    )
    damage: Mapped[float]                     # generowane uszkodzenia [cm pancerza]
    ammo: Mapped[int | None]                  # None = broń energetyczna, bez limitu
    energy: Mapped[int | None]                # GJ na strzał (tylko broń energetyczna)
    refire: Mapped[float | None]              # s między strzałami
    speed: Mapped[int | None]                 # m/s pocisku
    price: Mapped[int]
    stock: Mapped[int] = mapped_column(default=0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind.value,
            "damage": self.damage,
            "ammo": self.ammo,
            "energy": self.energy,
            "refire": self.refire,
            "speed": self.speed,
            "price": self.price,
            "stock": self.stock,
        }


class Client(db.Model):
    __tablename__ = "clients"
    __table_args__ = (CheckConstraint("credits >= 0", name="ck_client_credits"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    origin: Mapped[str] = mapped_column(String(64))
    profession: Mapped[Profession] = mapped_column(
        Enum(Profession, values_callable=lambda e: [m.value for m in e], native_enum=False)
    )
    credits: Mapped[int] = mapped_column(default=0)
    registered_at: Mapped[datetime] = mapped_column(default=utcnow)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="client")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "origin": self.origin,
            "profession": self.profession.value,
            "credits": self.credits,
            "registered_at": self.registered_at.isoformat(),
            "transactions": len(self.transactions),
        }


class Transaction(db.Model):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    total_price: Mapped[int]

    client: Mapped[Client] = relationship(back_populates="transactions")
    ships: Mapped[list["PurchasedShip"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "client": {
                "id": self.client.id,
                "name": self.client.name,
                "profession": self.client.profession.value,
            },
            "created_at": self.created_at.isoformat(),
            "total_price": self.total_price,
            "ships": [s.to_dict() for s in self.ships],
        }


class PurchasedShip(db.Model):
    __tablename__ = "purchased_ships"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"))
    hull_id: Mapped[int] = mapped_column(ForeignKey("hulls.id"))
    callsign: Mapped[str] = mapped_column(String(64), default="")
    hull_price: Mapped[int]   # cena w chwili zakupu (oferta może się zmienić)

    transaction: Mapped[Transaction] = relationship(back_populates="ships")
    hull: Mapped[Hull] = relationship(back_populates="purchases")
    weapons: Mapped[list["MountedWeapon"]] = relationship(
        back_populates="ship", cascade="all, delete-orphan"
    )

    @property
    def total_price(self) -> int:
        return self.hull_price + sum(w.unit_price * w.quantity for w in self.weapons)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "callsign": self.callsign,
            "hull": {"id": self.hull.id, "name": self.hull.name, "price": self.hull_price},
            "loadout": [w.to_dict() for w in self.weapons],
            "total_price": self.total_price,
        }


class MountedWeapon(db.Model):
    __tablename__ = "mounted_weapons"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_mounted_qty"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ship_id: Mapped[int] = mapped_column(ForeignKey("purchased_ships.id"))
    weapon_id: Mapped[int] = mapped_column(ForeignKey("weapons.id"))
    mount: Mapped[Mount] = mapped_column(
        Enum(Mount, values_callable=lambda e: [m.value for m in e], native_enum=False)
    )
    quantity: Mapped[int]
    unit_price: Mapped[int]

    ship: Mapped[PurchasedShip] = relationship(back_populates="weapons")
    weapon: Mapped[Weapon] = relationship()

    def to_dict(self) -> dict:
        return {
            "weapon": {"id": self.weapon.id, "name": self.weapon.name, "kind": self.weapon.kind.value},
            "mount": self.mount.value,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
        }
