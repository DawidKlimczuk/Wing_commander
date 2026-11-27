# =======================
# w tym pliku znajdują się funkcje odpowiedzialne za sprawdzanie danych wysłanych przez użytkownika
# =======================
# schemat to słownik nazwa_pola -> Field, validate() zbiera wszystkie błędy na raz
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from flask import request

from .errors import APIError, ValidationError

_MISSING = object()


# ==============
# klasa opisująca jedno pole (typ, czy wymagane, min, max itd.)
# ==============
@dataclass
class Field:
    type: type | tuple[type, ...]
    required: bool = True
    default: Any = None
    min: float | None = None
    max: float | None = None
    choices: tuple | None = None
    max_length: int | None = None
    nullable: bool = False


# ==============
# funkcja odpowiedzialna za pobranie JSON-a z żądania (jak jest zły to rzuca błąd)
# ==============
def get_json() -> dict:
    if not request.is_json:
        raise APIError("Oczekiwano danych w formacie JSON (Content-Type: application/json).",
                       status=415, code="UNSUPPORTED_MEDIA_TYPE")
    data = request.get_json(silent=True)
    if data is None:
        raise APIError("Ciało żądania nie jest poprawnym JSON-em.", code="MALFORMED_JSON")
    if not isinstance(data, dict):
        raise APIError("Oczekiwano obiektu JSON ({...}).", code="MALFORMED_JSON")
    return data


# ==============
# funkcja zamienia typ pythona na polską nazwę do komunikatu
# ==============
def _type_name(t) -> str:
    names = {int: "liczba całkowita", float: "liczba", str: "tekst", list: "lista", dict: "obiekt"}
    if isinstance(t, tuple):
        return " / ".join(names.get(x, x.__name__) for x in t)
    return names.get(t, t.__name__)


# ==============
# funkcja odpowiedzialna za sprawdzenie danych według schematu
# partial=True jest dla PATCH - wtedy sprawdzam tylko pola które przyszły
# ==============
def validate(data: dict, schema: dict[str, Field], partial: bool = False) -> dict:
    errors: dict[str, str] = {}
    out: dict[str, Any] = {}

    unknown = set(data) - set(schema)
    for key in sorted(unknown):
        errors[key] = "Nieznane pole."

    for name, f in schema.items():
        value = data.get(name, _MISSING)
        if value is _MISSING:
            if partial:
                continue
            if f.required:
                errors[name] = "Pole wymagane."
            elif f.default is not None or f.nullable:
                out[name] = f.default
            continue
        if value is None:
            if f.nullable:
                out[name] = None
            else:
                errors[name] = "Pole nie może być puste (null)."
            continue

        expected = f.type if isinstance(f.type, tuple) else (f.type,)
        # w pythonie bool to też int, więc true nie może przejść jako liczba
        if isinstance(value, bool) or not isinstance(value, expected):
            errors[name] = f"Oczekiwano typu: {_type_name(f.type)}."
            continue
        if isinstance(value, str):
            value = value.strip()
            if f.required and not value:
                errors[name] = "Pole nie może być puste."
                continue
            if f.max_length and len(value) > f.max_length:
                errors[name] = f"Maksymalna długość to {f.max_length} znaków."
                continue
        if f.min is not None and value < f.min:
            errors[name] = f"Wartość musi być >= {f.min}."
            continue
        if f.max is not None and value > f.max:
            errors[name] = f"Wartość musi być <= {f.max}."
            continue
        if f.choices is not None and value not in f.choices:
            errors[name] = f"Dozwolone wartości: {', '.join(map(str, f.choices))}."
            continue
        out[name] = value

    if partial and not data:
        errors["_"] = "Nie podano żadnego pola do zmiany."
    if errors:
        raise ValidationError("Niepoprawne dane wejściowe.", details={"fields": errors})
    return out
