import * as React from 'react';
import openshiftIcon from './icons/openshift.png';
import { PackageIcon } from '@patternfly/react-icons';

export interface CatalogItemIconProps {
  icon: string;
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
  icon,
}) => {
  if (icon.startsWith('{')) {
    const iconConfig: IconConfig = JSON.parse(icon)
    return (
      <img className="rhpds-catalog-item-icon"
        alt={iconConfig.alt}
        src={iconConfig.url}
        style={iconConfig.style}
      />
    );
  } else if (icon in icons) {
    return (
      <img className="rhpds-catalog-item-icon"
        alt={icon}
        src={icons[icon]}
      />
    );
  } else {
    return (<PackageIcon className="rhpds-catalog-item-icon" />);
  }
}

export { CatalogItemIcon };
