# =======================
# w tym pliku jest obiekt bazy danych (db), z którego korzystają inne pliki
# =======================
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


db = SQLAlchemy(model_class=Base)
