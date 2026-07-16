import React from 'react';
import { Tooltip } from '@patternfly/react-core';
import { getCostTier, formatCurrency } from '@app/Catalog/catalog-utils';

import './cost-tier-display.css';

const tierLabels = ['Low', 'Medium', 'High'];

const CostTierDisplay: React.FC<{ hourlyCost: number }> = ({ hourlyCost }) => {
  const tier = getCostTier(hourlyCost);
  const formattedCost = formatCurrency(hourlyCost);

  return (
    <span className="cost-tier-display" tabIndex={0}>
      <span className="cost-tier-display__amount">{formattedCost}/hr</span>
      <Tooltip content={`Cost level: ${tierLabels[tier - 1]}`}>
        <span className="cost-tier-display__tier" tabIndex={0}>
          {[1, 2, 3].map((level) => (
            <span
              key={level}
              className={`cost-tier-display__sign ${
                level <= tier ? 'cost-tier-display__sign--active' : 'cost-tier-display__sign--inactive'
              }`}
            >
              $
            </span>
          ))}
        </span>
      </Tooltip>
    </span>
  );
};

export default CostTierDisplay;
