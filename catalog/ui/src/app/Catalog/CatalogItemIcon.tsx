import React from 'react';
import PackageIcon from '@patternfly/react-icons/dist/js/icons/package-icon';
import { CatalogItem } from '@app/types';

const CatalogItemIcon: React.FC<{
  catalogItem: CatalogItem;
}> = ({ catalogItem }) => {
  const iconConfig = catalogItem.spec.icon;

  if (iconConfig) {
    try {
      if (iconConfig.url)
        return <img className="catalog-item-icon" alt={iconConfig.alt} src={iconConfig.url} style={iconConfig.style} />;
    } catch (_) {
      //
    }
  }

  return <PackageIcon className="catalog-item-icon" />;
};

export default CatalogItemIcon;
