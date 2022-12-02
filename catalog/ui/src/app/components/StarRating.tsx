import React, { useCallback, useMemo, useState } from 'react';
import OutlinedStarIcon from '@patternfly/react-icons/dist/js/icons/outlined-star-icon';
import StarIcon from '@patternfly/react-icons/dist/js/icons/star-icon';

const StarRating: React.FC<{ count: number; rating?: number; onRating?: (id: number) => void; readOnly?: boolean }> = ({
  count,
  rating = null,
  onRating,
  readOnly = false,
}) => {
  const [hoverRating, setHoverRating] = useState(0);

  const isFilled = useCallback(
    (index) => {
      if (readOnly) {
        return rating >= index;
      }
      if (hoverRating >= index) {
        return true;
      } else if (!hoverRating && rating >= index) {
        return true;
      }

      return false;
    },
    [hoverRating, rating, readOnly]
  );

  const starRating = useMemo(() => {
    return Array(count)
      .fill(0)
      .map((_, i) => i + 1)
      .map((idx) =>
        isFilled(idx) ? (
          <StarIcon
            key={idx}
            style={{ fill: '#06c', cursor: readOnly ? 'inherit' : 'pointer' }}
            onClick={() => onRating(idx)}
            onMouseEnter={() => setHoverRating(idx)}
            onMouseLeave={() => setHoverRating(0)}
          />
        ) : (
          <OutlinedStarIcon
            key={idx}
            style={{ fill: '#06c', cursor: readOnly ? 'inherit' : 'pointer' }}
            onClick={() => onRating(idx)}
            onMouseEnter={() => setHoverRating(idx)}
            onMouseLeave={() => setHoverRating(0)}
          />
        )
      );
  }, [count, isFilled, onRating, readOnly]);

  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
      {starRating}
      {rating === null && readOnly ? (
        <p
          style={{
            fontWeight: 300,
            color: 'var(--pf-global--palette--black-500)',
            fontSize: 'var(--pf-global--FontSize--xs)',
            marginLeft: 'var(--pf-global--spacer--sm)',
            paddingTop: '1px',
          }}
        >
          Not rated
        </p>
      ) : null}
    </div>
  );
};

export default StarRating;
