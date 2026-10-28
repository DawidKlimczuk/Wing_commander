"""Minimalistyczna walidacja danych wejściowych (bez zewnętrznych zależności).

Schemat to słownik  nazwa_pola -> Field. `validate()` zbiera WSZYSTKIE błędy
naraz, żeby klient dostał pełną listę problemów w jednej odpowiedzi 422.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from flask import request

from .errors import APIError, ValidationError

_MISSING = object()


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


def get_json() -> dict:
    """Zwraca ciało żądania jako dict albo rzuca czytelny błąd."""
    if not request.is_json:
        raise APIError("Oczekiwano danych w formacie JSON (Content-Type: application/json).",
                       status=415, code="UNSUPPORTED_MEDIA_TYPE")
    data = request.get_json(silent=True)
    if data is None:
        raise APIError("Ciało żądania nie jest poprawnym JSON-em.", code="MALFORMED_JSON")
    if not isinstance(data, dict):
        raise APIError("Oczekiwano obiektu JSON ({...}).", code="MALFORMED_JSON")
    return data


def _type_name(t) -> str:
    names = {int: "liczba całkowita", float: "liczba", str: "tekst", list: "lista", dict: "obiekt"}
    if isinstance(t, tuple):
        return " / ".join(names.get(x, x.__name__) for x in t)
    return names.get(t, t.__name__)


def validate(data: dict, schema: dict[str, Field]) -> dict:
    errors: dict[str, str] = {}
    out: dict[str, Any] = {}

    unknown = set(data) - set(schema)
    for key in sorted(unknown):
        errors[key] = "Nieznane pole."

    for name, f in schema.items():
        value = data.get(name, _MISSING)
        if value is _MISSING:
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
        # bool jest podklasą int w Pythonie - nie chcemy akceptować true jako 1
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

    if errors:
        raise ValidationError("Niepoprawne dane wejściowe.", details={"fields": errors})
    return out
