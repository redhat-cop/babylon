import React from 'react';
import { BABYLON_DOMAIN } from '@app/util';
import { CatalogItem } from '@app/types';
import openshiftIcon from './icons/openshift.png';
import { PackageIcon } from '@patternfly/react-icons';

const icons = {
  openshift: openshiftIcon,
};

const CatalogItemIcon: React.FC<{
  catalogItem: CatalogItem;
}> = ({ catalogItem }) => {
  const iconValue = catalogItem.metadata.annotations?.[`${BABYLON_DOMAIN}/icon`];

  if (!iconValue) {
    return <PackageIcon className="catalog-item-icon" />;
  } else if (iconValue.startsWith('{')) {
    const iconConfig: {
      url: string;
      alt: string;
      style?: Record<string, unknown>;
    } = JSON.parse(iconValue);
    return <img className="catalog-item-icon" alt={iconConfig.alt} src={iconConfig.url} style={iconConfig.style} />;
  } else if (iconValue in icons) {
    return <img className="catalog-item-icon" alt={iconValue} src={icons[iconValue]} />;
  }

  return <PackageIcon className="catalog-item-icon" />;
};

export default CatalogItemIcon;
