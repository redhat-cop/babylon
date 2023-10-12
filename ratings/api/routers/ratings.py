from typing import List, Optional
import logging
from fastapi import APIRouter, HTTPException, Depends
from schemas import (
    RatingsListSchema,
    RatingSchema,
    RatingCreateSchema,
    RatingProvisionCreateSchema,
    CatalogItemRatingAverageSchema,
    WorkshopRequestSchema
)
from models import Rating, ProvisionRequest
from .pagination import get_pagination_params


logger = logging.getLogger('babylon-ratings')


tags = ["ratings"]

router = APIRouter(tags=tags)


@router.get("/api/ratings/v1/catalogitem/{asset_uuid}",
            response_model=CatalogItemRatingAverageSchema,
            summary="Get rating by catalog item asset UUID")
async def catalog_item_rating_get(asset_uuid: str,
                                  catalog_name: Optional[str] = None,
                                  include_details: bool = False
                                  ) -> CatalogItemRatingAverageSchema:

    logger.info(f"Getting rating for catalog item {asset_uuid}")
    rating = await Rating.catalog_item_average(asset_uuid,
                                               catalog_name,
                                               include_details)

    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")

    return rating


@router.get("/api/ratings/v1/catalogitem/{asset_uuid}/history",
            response_model=List[RatingSchema],
            summary="Get rating history by catalog item asset UUID")
async def catalog_item_rating_history_get(asset_uuid: str,
                                          catalog_name: Optional[str] = None,
                                          include_details: bool = False
                                          ) -> List[RatingSchema]:
    logger.info(f"Getting rating history for catalog item {asset_uuid}")
    average_rating = await Rating.catalog_item_rating(asset_uuid,
                                                      catalog_name,
                                                      include_details)

    if not average_rating:
        raise HTTPException(status_code=404, detail="No ratings found for this catalog item")

    formatted_ratings = [rating.to_dict(include_details) for rating in average_rating]

    return formatted_ratings


@router.get("/api/ratings/v1/list",
            response_model=RatingsListSchema,
            summary="List all ratings",
            description="List all ratings with pagination",
            response_description="The list of ratings")
async def list_ratings_get(pagination: dict = Depends(get_pagination_params),
                           include_details: bool = False) -> List[RatingsListSchema]:

    logger.info(f"Getting ratings list with pagination: {pagination}")
    page = pagination["page"]
    per_page = pagination["per_page"]
    ratings_list = await Rating.list_ratings_paged(page,
                                                   per_page,
                                                   include_details
                                                   )

    ratings_formatted = []
    for rating in ratings_list:
        request = None
        provision = None
        if include_details and rating:
            if hasattr(rating, 'request') and rating.request:
                request = rating.request.to_dict(include_details)
            if hasattr(rating, 'provision') and rating.provision:
                provision = rating.provision.to_dict(include_details)

        ratings_formatted.append(rating.to_dict())
        ratings_formatted[-1]["request"] = request if request else None
        ratings_formatted[-1]["provision"] = provision if provision else None

    total = await Rating.get_total_count()
    total_pages = (total // per_page) + (1 if total % per_page else 0)
    next_page = page + 1 if page < total_pages else None
    prev_page = page - 1 if page > 1 else None

    return RatingsListSchema(
        ratings=ratings_formatted,
        total_pages=total_pages,
        page=page,
        per_page=per_page,
        next_page=next_page,
        prev_page=prev_page,
        count=len(ratings_formatted)
    )


@router.get("/api/ratings/v1/provisions/{provision_uuid}/email/{email}",
            response_model=RatingSchema,
            summary="Get rating by provision UUID and email")
async def provision_rating_by_email_get(provision_uuid: str,
                                        email: str,
                                        include_details: bool = False
                                        ) -> RatingSchema:

    logger.info(f"Getting rating for request {provision_uuid} and email {email}")
    rating = await Rating.get_provision_rating_by_email(provision_uuid, email)

    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")

    return rating.to_dict(include_details)


@router.post("/api/ratings/v1/provisions/{provision_uuid}",
             response_model=RatingSchema,
             summary="Create or update provision rating",
             )
async def provision_rating_post(provision_uuid: str,
                                new_rating: RatingProvisionCreateSchema,
                                include_details: bool = False) -> RatingSchema:

    logger.info(f"Creating or updating rating for provision {provision_uuid}")
    rating = Rating.from_dict(new_rating.model_dump())
    rating.provision_uuid = provision_uuid
    try:
        rating = await rating.save_provision_rating()
    except Exception as e:
        logger.error(f"Error saving rating: {e}", stack_info=True)
        raise HTTPException(status_code=404, detail="Error saving rating") from e

    return rating.to_dict(include_details)


@router.get("/api/ratings/v1/request/{request_uid}/email/{email}",
            response_model=RatingSchema,
            summary="Get rating by request UID and email")
async def request_rating_by_email_get(request_uid: str,
                                      email: str,
                                      include_details: bool = False
                                      ) -> RatingSchema:

    logger.info(f"Getting rating for request {request_uid} and email {email}")
    rating = await Rating.get_request_rating_by_email(request_uid, email)

    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")

    return rating.to_dict(include_details)


@router.get("/api/ratings/v1/request/{request_uid}",
            response_model=List[RatingSchema],
            summary="Get rating by request UID")
async def request_rating_get(request_uid: str,
                             include_details: bool = False
                             ) -> Optional[List[RatingSchema]]:

    logger.info(f"Getting rating for request {request_uid}")
    ratings = await Rating.get_request_id(request_uid)

    if not ratings:
        raise HTTPException(status_code=404, detail="Rating not found")

    return [rating.to_dict(include_details) for rating in ratings]


@router.post("/api/ratings/v1/request/{request_uid}",
             response_model=RatingSchema,
             summary="Create or update request rating",
             )
async def request_rating_post(request_uid: str,
                              new_rating: RatingCreateSchema,
                              include_details: bool = False) -> RatingSchema:

    logger.info(f"Creating or updating rating for request {request_uid}")
    rating = Rating.from_dict(new_rating.model_dump())
    rating.request_id = request_uid
    try:
        rating = await rating.save_request_rating()
    except Exception as e:
        logger.error(f"Error saving rating: {e}", stack_info=True)
        raise HTTPException(status_code=404, detail="Error saving rating") from e

    return rating.to_dict(include_details)


@router.get("/api/ratings/v1/workshop/{workshop_id}",
            response_model=WorkshopRequestSchema,
            summary="Get request ID by workshop ID")
async def workshop_rating_get(workshop_id: str) -> WorkshopRequestSchema:
    logger.info(f"Getting request ID for workshop {workshop_id}")
    request = await ProvisionRequest.get_request_workshop(workshop_id)
    if not request:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return {'request_id': request.id if request else None}
