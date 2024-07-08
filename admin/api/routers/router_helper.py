from fastapi import Query


def get_pagination_params(
    page: int = Query(1, description="Page number to retrieve"),
    per_page: int = Query(50, le=100, description="Number of items per page, max 100")
) -> dict:
    return {"page": page, "per_page": per_page}


def get_status_params(
    status: str = Query(...,
                        example="active",
                        alias="status",
                        title="Incident Status",
                        description="The status of the incident (active, resolved, all).",
                        regex='^(active|resolved|all)$'),
    interface: str = Query(...,
                        example="rhpds",
                        alias="interface",
                        title="Interface origin",
                        description="The interface where the incident is going to be displayed")
) -> dict:
    return {"status": status, "interface": interface}
