import React from 'react';
import StarRatings from 'react-star-ratings';

const CatalogItemRating: React.FC<{
  rating: number;
  starDimension: string;
}> = ({ rating, starDimension }) => {
  return (
    <StarRatings
      rating={rating}
      numberOfStars={5}
      starDimension={starDimension}
      starEmptyColor="#dddddd"
      starRatedColor="#f0ab00"
      starSpacing="0px"
    />
  );
};

export default CatalogItemRating;
