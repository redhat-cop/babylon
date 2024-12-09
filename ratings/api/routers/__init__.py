from fastapi import Query
from . import ratings
from . import bookmarks

def get_pagination_params(
    page: int = Query(1, description="Número da página a ser recuperada"),
    per_page: int = Query(10, description="Número de itens por página")
) -> dict:
    return {"page": page, "per_page": per_page}
