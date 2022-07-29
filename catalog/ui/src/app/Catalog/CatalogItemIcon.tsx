import React from 'react';
import { BABYLON_DOMAIN } from '@app/util';
import { CatalogItem } from '@app/types';
import openshiftIcon from './icons/openshift.png';
// import { PackageIcon } from '@patternfly/react-icons';
// TODO: Use the patternfly icon instead of the custom one, right now is failing in the Terser minification
const PackageIcon = (props: React.HTMLAttributes<SVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    height="1em"
    width="1em"
    viewBox="0 0 1024 1024"
    aria-hidden="true"
    style={{
      verticalAlign: '-.125em',
    }}
    {...props}
  >
    <path d="m567.7 1010.497 383.8-191.999c43.2-21.8 72.5-66.1 72.5-114.5V320.002c0-48.4-28.4-92.9-71.8-114.499L568.6 13.503C550.8 4.603 531.4.103 512-.002c-19.7-.095-39.5 4.405-57.6 13.505L70.8 205.502c-43.4 21.6-70.8 66-70.8 114.3l.9 384.197c0 48.4 27.4 92.8 70.7 114.4l383.6 191.998c9.1 4.5 32.9 13.6 56.7 13.6 23.6 0 46.9-9 55.8-13.5ZM512.5 630.9l160-80v94.4l64-32V518.9l159.5-80 .5 273.799-384 191.999V630.899ZM145.1 304.101l149.8-75.5c.4.2.7.4 1.1.6l365.9 183.1-149.4 75.3-367.4-183.5Zm367.4-185.199 368.8 182.8L733.1 376.4 366 192.702l146.5-73.8Z" />
  </svg>
);

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
