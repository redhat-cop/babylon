from typing import List, Optional
import logging
from pydantic import BaseModel, Field, validator
from datetime import datetime
from .request import RequestSchema
from .provision import ProvisionSchema

logger = logging.getLogger('babylon-ratings')


class RatingSchema(BaseModel):
    id: int = Field(..., description="The unique identifier for the rating.")
    catalog_item_id: Optional[int] = Field(None,
                                           description="The unique identifier for the catalog item.")
    request_id: Optional[str] = Field(...,
                                      description="The unique identifier for the request.")
    provision_uuid: Optional[str] = Field(...,
                                          description="The unique identifier for the provision.")
    email: str = Field(..., description="The email of the user who rated.")
    comments: Optional[str] = Field(None, description="The comments for the rating.")
    rating: int = Field(..., description="The rating value between 10 and 50.")
    useful: Optional[str] = Field(None, description="Indicates if the rating was useful.")
    created_at: Optional[datetime] = Field(None, description="The date the rating was created.")
    updated_at: Optional[datetime] = Field(None, description="The date the rating was updated.")

    request: Optional[RequestSchema] = Field(None, description="Details of the associated request.")
    provision: Optional[ProvisionSchema] = Field(None, description="Details of the associated provision.")

    class Config:
        from_attributes = True


class RatingCreateSchema(BaseModel):
    request_id: str = Field(..., description="The unique identifier for the request.")
    email: str = Field(..., description="The email of the user who rated.")
    rating: int = Field(..., description="The rating value between 10 and 50.")
    comments: Optional[str] = Field(None, description="The comments for the rating.")
    useful: Optional[str] = Field(None, description="Indicates if the rating was useful.")

    class Config:
        from_attributes = True

    @validator('rating', pre=True, always=True)
    def check_rating_range(cls, rating):
        if 10 <= rating <= 50:
            return rating
        logging.error(f"Rating {rating} is not between 10 and 50.")
        raise ValueError('Rating should be between 10 and 50.')


class RatingProvisionCreateSchema(BaseModel):
    email: str = Field(..., description="The email of the user who rated.")
    rating: int = Field(..., description="The rating value between 10 and 50.")
    comments: Optional[str] = Field(None, description="The comments for the rating.")
    useful: Optional[str] = Field(None, description="Indicates if the rating was useful.")

    class Config:
        from_attributes = True

    @validator('rating', pre=True, always=True)
    def check_rating_range(cls, rating):
        if 10 <= rating <= 50:
            return rating
        logging.error(f"Rating {rating} is not between 10 and 50.")
        raise ValueError('Rating should be between 10 and 50.')


class CatalogItemRatingAverageSchema(BaseModel):
    rating_score: Optional[float] = Field(..., description="The average rating score for the catalog item.")
    total_ratings: int = Field(..., description="The total number of ratings for the catalog item.")
    ratings: Optional[List[RatingSchema]] = Field(default=None,
                                                  alias="ratings",
                                                  exclude_none=True,
                                                  description="The list of ratings for the catalog item.")

    class Config:
        from_attributes = True


class RatingsListSchema(BaseModel):
    ratings: Optional[List[RatingSchema]] = Field(..., description="The list of ratings.")
    total_pages: int = Field(..., description="The total number of pages.")
    page: int = Field(..., description="The current page.")
    per_page: int = Field(..., description="The number of ratings per page.")
    next_page: Optional[int] = Field(None, description="The next page.")
    prev_page: Optional[int] = Field(None, description="The previous page.")
    count: Optional[int] = Field(None, description="The total number of ratings.")

    class Config:
        from_attributes = True
