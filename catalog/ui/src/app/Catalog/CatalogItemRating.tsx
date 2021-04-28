import * as React from 'react';

import StarRatings from 'react-star-ratings';

export interface CatalogItemRatingProps {
  catalogItem: object;
  starDimension: string;
}

const CatalogItemRating: React.FunctionComponent<CatalogItemRatingProps> = ({
  catalogItem,
  starDimension,
}) => {
  if (!catalogItem.status || !catalogItem.status.rating) {
    return (<div className="rhpds-no-data">unavailable</div>);
  }
  
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

export { CatalogItemRating };
