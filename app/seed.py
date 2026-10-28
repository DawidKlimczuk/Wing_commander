"""Dane startowe - oferta stoczni w Sektorze Gemini.

Statystyki kadłubów: wcnews.com/ships (Privateer, 1993).
Statystyki dział: analiza plików gry, apocalyptech.com/games/privgun.
Ceny kadłubów i rakiet są orientacyjne (Centurion: 150 000 kr wg WCPedii).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .extensions import db
from .models import (Client, Hull, Mount, MountedWeapon, Profession, PurchasedShip,
                     Transaction, Weapon, WeaponKind)

HULLS = [
    dict(name="Tarsus", ship_class="Merchant Scout", armor_front=10, armor_rear=10, armor_side=8,
         cargo=100, max_velocity=300, afterburner_velocity=600, acceleration="Average",
         gun_slots=2, turret_slots=0, missile_slots=1, price=20_000, stock=6,
         description="Stary, wysłużony kadłub handlowy. Nikt nie kupuje Tarsusa z wyboru - "
                     "ale każdy od czegoś zaczynał."),
    dict(name="Galaxy", ship_class="Merchant", armor_front=25, armor_rear=20, armor_side=17.5,
         cargo=150, max_velocity=300, afterburner_velocity=750, acceleration="Average",
         gun_slots=2, turret_slots=2, missile_slots=2, price=60_000, stock=4,
         description="Latająca ładownia. 150 jednostek w standardzie, wieżyczka na ogonie "
                     "dla tych, którzy wiozą coś cennego."),
    dict(name="Orion", ship_class="Mercenary Gunship", armor_front=48, armor_rear=50, armor_side=35,
         cargo=50, max_velocity=350, afterburner_velocity=800, acceleration="Average",
         gun_slots=2, turret_slots=2, missile_slots=1, price=100_000, stock=3,
         description="Opancerzona cegła. Wolny, ale zanim przebiją się przez pancerz, "
                     "zdążysz wypić drinka w barze na Perry."),
    dict(name="Centurion", ship_class="Mercenary Heavy Fighter", armor_front=20, armor_rear=15,
         armor_side=15, cargo=50, max_velocity=500, afterburner_velocity=1000,
         acceleration="Excellent", gun_slots=4, turret_slots=2, missile_slots=2, price=150_000,
         stock=2,
         description="Najszybszy i najzwrotniejszy kadłub w ofercie. Marzenie każdego "
                     "łowcy nagród w Sektorze Gemini."),
]

WEAPONS = [
    # broń energetyczna: (nazwa, prędkość, obrażenia, energia, refire, cena)
    *[dict(name=n, kind=WeaponKind.ENERGY, speed=v, damage=d, energy=e, refire=r, price=p,
           ammo=None, stock=s)
      for n, v, d, e, r, p, s in [
          ("Laser", 1400, 2.0, 4, 0.30, 1_000, 20),
          ("Mass Driver", 1100, 2.6, 5, 0.35, 1_500, 18),
          ("Meson Blaster", 1300, 3.2, 8, 0.40, 2_500, 14),
          ("Neutron Gun", 960, 6.2, 16, 0.65, 5_000, 10),
          ("Particle Cannon", 1000, 4.3, 11, 0.50, 10_000, 8),
          ("Tachyon Cannon", 1250, 5.0, 8, 0.40, 20_000, 6),
          ("Ionic Pulse Cannon", 1200, 5.4, 15, 0.60, 40_000, 3),
          ("Plasma Gun", 940, 7.2, 19, 0.72, 80_000, 2),
      ]],
    # rakiety: (nazwa, obrażenia, amunicja w pakiecie, cena pakietu)
    *[dict(name=n, kind=WeaponKind.MISSILE, damage=d, ammo=a, price=p, stock=s,
           energy=None, refire=None, speed=None)
      for n, d, a, p, s in [
          ("Dumbfire Missile", 25, 4, 200, 30),
          ("Heat Seeker Missile", 30, 4, 600, 24),
          ("Image Rec Missile", 35, 4, 1_000, 16),
          ("Friend or Foe Missile", 40, 4, 1_500, 12),
          ("Proton Torpedo", 60, 2, 2_500, 6),
      ]],
]

CLIENTS = [
    ("Grayson Burrows", "Troy", Profession.TRADER, 75_000),
    ("Tayla", "Mainz Pirate Base", Profession.PIRATE, 210_000),
    ("Roman Lynch", "New Constantinople", Profession.MERCENARY, 95_000),
    ("Miggs", "Perry Naval Base", Profession.BOUNTY_HUNTER, 120_000),
    ("Sandoval", "Oxford", Profession.TRADER, 15_000),
    ("Jones", "New Detroit", Profession.SMUGGLER, 70_000),
]

ORIGINS = [
    "Achilles", "Basra", "Edom", "Edinburgh", "Glasgow", "Liverpool", "Mainz Pirate Base",
    "New Constantinople", "New Detroit", "Oxford", "Perry Naval Base", "Remus", "Speke", "Troy",
]


def seed_database() -> None:
    hulls = {h["name"]: Hull(**h) for h in HULLS}
    weapons = {w["name"]: Weapon(**w) for w in WEAPONS}
    clients = {n: Client(name=n, origin=o, profession=p, credits=c) for n, o, p, c in CLIENTS}
    db.session.add_all([*hulls.values(), *weapons.values(), *clients.values()])

    # kilka historycznych transakcji, żeby statystyki nie świeciły pustkami
    now = datetime.now(timezone.utc)
    history = [
        ("Tayla", 9, "Centurion", "Krwawa Mary",
         [("Tachyon Cannon", Mount.GUN, 2), ("Mass Driver", Mount.GUN, 2),
          ("Friend or Foe Missile", Mount.MISSILE, 2)]),
        ("Roman Lynch", 6, "Orion", "Kowadło",
         [("Particle Cannon", Mount.GUN, 2), ("Laser", Mount.TURRET, 2),
          ("Heat Seeker Missile", Mount.MISSILE, 1)]),
        ("Jones", 2, "Galaxy", "Cicha Woda",
         [("Mass Driver", Mount.GUN, 2), ("Dumbfire Missile", Mount.MISSILE, 2)]),
    ]
    for client_name, days_ago, hull_name, callsign, loadout in history:
        client, hull = clients[client_name], hulls[hull_name]
        ship = PurchasedShip(hull=hull, hull_price=hull.price, callsign=callsign)
        for w_name, mount, qty in loadout:
            w = weapons[w_name]
            ship.weapons.append(MountedWeapon(weapon=w, mount=mount, quantity=qty, unit_price=w.price))
            w.stock -= qty
        hull.stock -= 1
        db.session.add(Transaction(client=client, ships=[ship], total_price=ship.total_price,
                                   created_at=now - timedelta(days=days_ago)))
    db.session.commit()
