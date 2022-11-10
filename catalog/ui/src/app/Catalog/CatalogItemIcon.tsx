import React from 'react';
import PackageIcon from '@patternfly/react-icons/dist/js/icons/package-icon';
import { BABYLON_DOMAIN } from '@app/util';
import { CatalogItem } from '@app/types';
import openshiftIcon from './icons/openshift.png';

const icons = {
  openshift: openshiftIcon,
};

const CatalogItemIcon: React.FC<{
  catalogItem: CatalogItem;
}> = ({ catalogItem }) => {
  const iconValue = catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/icon`];

  if (iconValue) {
    try {
      const iconConfig: {
        url: string;
        alt: string;
        style?: Record<string, unknown>;
      } = JSON.parse(iconValue);
      if (iconConfig.url)
        return <img className="catalog-item-icon" alt={iconConfig.alt} src={iconConfig.url} style={iconConfig.style} />;
    } catch (_) {
      //
    }
    if (iconValue in icons) {
      return <img className="catalog-item-icon" alt={iconValue} src={icons[iconValue]} />;
    }
  }

  return <PackageIcon className="catalog-item-icon" />;
};

export default CatalogItemIcon;
