import * as React from 'react';
import { PackageIcon } from '@patternfly/react-icons';
import { CatalogItem } from '@app/types';
import openshiftIcon from './icons/openshift.png';

interface CatalogItemIconProps {
  catalogItem: CatalogItem;
}

const icons = {
  openshift: openshiftIcon,
};

interface IconConfig {
  url: string;
  alt: string;
  style?: object;
}

const CatalogItemIcon: React.FunctionComponent<CatalogItemIconProps> = ({
  catalogItem,
}) => {
  const iconValue = catalogItem.metadata.annotations?.['babylon.gpte.redhat.com/icon'];

  if (!iconValue) {
    return (<PackageIcon className="catalog-item-icon" />);
  } else if (iconValue.startsWith('{')) {
    const iconConfig: IconConfig = JSON.parse(iconValue)
    return (
      <img className="catalog-item-icon"
        alt={iconConfig.alt}
        src={iconConfig.url}
        style={iconConfig.style}
      />
    );
  } else if (iconValue in icons) {
    return (
      <img className="catalog-item-icon"
        alt={iconValue}
        src={icons[iconValue]}
      />
    );
  } else {
    return (<PackageIcon className="catalog-item-icon" />);
  }
}

export default CatalogItemIcon;
