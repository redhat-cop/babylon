import * as React from 'react';
import openshiftIcon from './icons/openshift.png';
import { PackageIcon } from '@patternfly/react-icons';

export interface CatalogItemIconProps {
  icon: string;
}

const icons = {
  openshift: openshiftIcon,
};

const CatalogItemIcon: React.FunctionComponent<CatalogItemIconProps> = ({
  icon,
}) => {
  if (icon in icons) {
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
