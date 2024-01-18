from fastapi import Query


def get_pagination_params(
    page: int = Query(1, description="Page number to retrieve"),
    per_page: int = Query(50, le=100, description="Number of items per page, max 100")
) -> dict:
    return {"page": page, "per_page": per_page}
