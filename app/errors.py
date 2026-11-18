# =======================
# w tym pliku znajdują się klasy błędów i funkcje odpowiedzialne za obsługę błędów
# =======================
# każdy błąd wraca jako JSON w takiej postaci:
# {"error": {"status": 404, "code": "NOT_FOUND", "message": "...", "details": {...}}}
from __future__ import annotations

import logging

from flask import Flask, jsonify, request
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException

from .extensions import db

log = logging.getLogger(__name__)


# ==============
# główna klasa błędu API, po niej dziedziczą pozostałe
# ==============
class APIError(Exception):
    status = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str, *, details: dict | None = None,
                 status: int | None = None, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if status is not None:
            self.status = status
        if code is not None:
            self.code = code


# ==============
# błędy dla konkretnych sytuacji (złe dane, brak obiektu, brak kasy itd.)
# ==============
class ValidationError(APIError):
    status = 422
    code = "VALIDATION_ERROR"


class NotFound(APIError):
    status = 404
    code = "NOT_FOUND"


class Conflict(APIError):
    status = 409
    code = "CONFLICT"


class InsufficientCredits(APIError):
    status = 402
    code = "INSUFFICIENT_CREDITS"


class OutOfStock(APIError):
    status = 409
    code = "OUT_OF_STOCK"


# ==============
# funkcja odpowiedzialna za zbudowanie odpowiedzi JSON z błędem
# ==============
def error_response(status: int, code: str, message: str, details: dict | None = None):
    body = {"status": status, "code": code, "message": message}
    if details:
        body["details"] = details
    return jsonify(error=body), status


# zamiana numeru błędu HTTP na nazwę
HTTP_CODES = {
    400: "BAD_REQUEST",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    500: "INTERNAL_ERROR",
}


# ==============
# funkcja odpowiedzialna za podpięcie obsługi błędów do aplikacji
# ==============
def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(APIError)
    def handle_api_error(err: APIError):
        return error_response(err.status, err.code, err.message, err.details)

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(err: IntegrityError):
        db.session.rollback()
        return error_response(409, "INTEGRITY_ERROR",
                              "Operacja narusza spójność bazy danych.",
                              {"reason": str(err.orig)})

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        details = None
        if err.code == 405:
            details = {"method": request.method,
                       "allowed": sorted(err.valid_methods or [])}
        elif err.code == 404:
            details = {"path": request.path}
        return error_response(err.code, HTTP_CODES.get(err.code, err.name.upper().replace(" ", "_")),
                              err.description, details)

    @app.errorhandler(Exception)
    def handle_unexpected(err: Exception):
        db.session.rollback()
        log.exception("Nieobsłużony wyjątek")
        return error_response(500, "INTERNAL_ERROR",
                              "Awaria systemów pokładowych. Spróbuj ponownie.")
