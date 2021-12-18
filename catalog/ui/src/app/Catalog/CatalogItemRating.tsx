import * as React from 'react';

import StarRatings from 'react-star-ratings';

export interface CatalogItemRatingProps {
  catalogItem: any;
  starDimension: string;
}

const CatalogItemRating: React.FunctionComponent<CatalogItemRatingProps> = ({
  catalogItem,
  starDimension,
}) => {
  return (
    <StarRatings
      rating={catalogItem.status.rating}
      numberOfStars={5}
      starDimension={starDimension}
      starEmptyColor="#dddddd"
      starRatedColor="#f0ab00"
      starSpacing="0px"
    />
  );
}

export default CatalogItemRating;
