import React from 'react';
import { Tooltip } from '@patternfly/react-core';

export const SUPPORT_LEVELS = ['community', 'standard', 'enterprise', 'event'] as const;

const communityIconPaths = [
  'M31.67 9.52A9.69 9.69 0 0 0 18 5.7C8.14 0-1.77 12.56 6.14 20.8a2.63 2.63 0 0 0 2.8 2.85 2.62 2.62 0 0 0 2.73 2.88 2.65 2.65 0 0 0 3.56 2.78 2.65 2.65 0 0 0 4.57 1.44l9.94-9.94a9.59 9.59 0 0 0 1.93-11.29ZM4.55 14c-.1-7.38 9.2-11.24 14.37-6l4.61 4.62c1.26 1.29-.68 3.27-2 2L17 10a.66.66 0 0 0-.7-.13 4.77 4.77 0 0 1-3.3 1.4A4.39 4.39 0 0 1 9.83 10a.63.63 0 0 0-.89.88 5.49 5.49 0 0 0 4.65 1.6l-6.75 6.73a2.88 2.88 0 0 0-.22.27A8.36 8.36 0 0 1 4.55 14Zm24.32 6-9.95 10a1.39 1.39 0 1 1-2.13-1.79l3-3a.64.64 0 0 0 0-.89.63.63 0 0 0-.88 0l-3.55 3.55a1.39 1.39 0 1 1-2-2L17 22.22a.63.63 0 0 0-.88-.89l-3.56 3.56a1.38 1.38 0 0 1-1.95-1.95l3.55-3.56c.58-.56-.32-1.47-.89-.88L9.7 22a1.39 1.39 0 0 1-2-2l8.78-8.77 4 4a.6.6 0 0 0 .09.13 2.65 2.65 0 0 0 3.77-3.72l-5-5a2.45 2.45 0 0 1-.35-.29C27.68 2 35.8 13.1 28.87 19.92Z',
];
const standardIconPaths = [
  'M27 7.38h-4c-.9 0-.57 1.24-.62 1.8h-8.76c0-.54.28-1.79-.62-1.8H9a.61.61 0 0 0-.62.62v23a.61.61 0 0 0 .62.62h18a.61.61 0 0 0 .62-.62V8a.61.61 0 0 0-.62-.62Zm-.62 23H9.62V8.62h2.76c0 .56-.28 1.79.62 1.81h10c.9 0 .57-1.25.62-1.81h2.76ZM12 6.62h3c.31 0 .65-.07.76-.41a2.37 2.37 0 0 1 4.48 0 .68.68 0 0 0 .76.41h3a.62.62 0 0 0 0-1.24h-2.77a3.63 3.63 0 0 0-6.46 0H12a.62.62 0 0 0 0 1.24Z',
  'm22.13 15.51-4-.85a.57.57 0 0 0-.26 0l-4 .85a.62.62 0 0 0-.49.61v4.61c.19 6.11 9 6.11 9.25 0v-4.61a.62.62 0 0 0-.5-.61Zm-4.13.4 3.38.72v.16l-6.76 3.52v-3.68Zm0 8.19a3.36 3.36 0 0 1-3.23-2.45l6.61-3.45v2.53A3.38 3.38 0 0 1 18 24.1ZM17.38 6a.63.63 0 1 0 .62-.63.62.62 0 0 0-.62.63Z',
];
const enterpriseIconPaths = [
  'M5 12.62h26a.62.62 0 0 0 .61-.47.63.63 0 0 0-.31-.7l-13-7a.64.64 0 0 0-.6 0l-13 7a.63.63 0 0 0-.31.7.62.62 0 0 0 .61.47Zm13-6.91 10.52 5.67h-21ZM29.14 13.38H6.86a.62.62 0 1 0 0 1.24h22.28a.62.62 0 1 0 0-1.24ZM6.23 29a.62.62 0 0 0 .63.62h22.28a.62.62 0 1 0 0-1.24H6.86a.62.62 0 0 0-.63.62ZM31.62 30.38H4.38a.62.62 0 1 0 0 1.24h27.24a.62.62 0 0 0 0-1.24ZM8.62 27V16a.62.62 0 0 0-1.24 0v11a.62.62 0 0 0 1.24 0ZM18.62 27V16a.62.62 0 0 0-1.24 0v11a.62.62 0 0 0 1.24 0ZM23.62 27V16a.62.62 0 0 0-1.24 0v11a.62.62 0 0 0 1.24 0ZM13.62 27V16a.62.62 0 0 0-1.24 0v11a.62.62 0 0 0 1.24 0ZM28.62 27V16a.62.62 0 0 0-1.24 0v11a.62.62 0 0 0 1.24 0Z',
];
const eventIconPaths = [
  'M29 8.25H7a.76.76 0 0 0-.75.75v15.05a.58.58 0 0 0 0 .19v.08a1 1 0 0 0 .15.21l5 5a.78.78 0 0 0 .24.16.72.72 0 0 0 .29.06H29a.76.76 0 0 0 .75-.75V9a.76.76 0 0 0-.75-.75ZM11.25 27.19l-2.44-2.44h2.44Zm17 1.06h-15.5V24a.76.76 0 0 0-.75-.75H7.75v-9.5h2.5V15a.75.75 0 0 0 1.5 0v-1.25h12.5V15a.75.75 0 0 0 1.5 0v-1.25h2.5Zm0-16h-2.5V11a.75.75 0 0 0-1.5 0v1.25h-12.5V11a.75.75 0 0 0-1.5 0v1.25h-2.5v-2.5h20.5Z',
];

const SlaIcon: React.FC<{ level: typeof SUPPORT_LEVELS[number] } & React.HTMLAttributes<HTMLOrSVGElement>> = ({
  level,
  ...props
}) => {
  let paths = [];
  let displayName = '';
  switch (level) {
    case 'standard':
      paths = standardIconPaths;
      displayName = 'Enterprise | Standard';
      break;
    case 'enterprise':
      paths = enterpriseIconPaths;
      displayName = 'Enterprise | Premium';
      break;
    case 'event':
      paths = eventIconPaths;
      displayName = 'Pre Scheduled Events (min 2 weeks)';
      break;
    default:
      paths = communityIconPaths;
      displayName = 'Community Content';
      break;
  }
  return (
    <Tooltip content={<p>{displayName}</p>}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" {...props}>
        {paths.map((path) => (
          <path style={{ fill: '#e00' }} d={path} key={path} />
        ))}
      </svg>
    </Tooltip>
  );
};

export default SlaIcon;
