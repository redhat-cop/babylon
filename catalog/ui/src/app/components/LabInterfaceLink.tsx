import React from 'react';
import { useSelector } from 'react-redux';
import { Button } from '@patternfly/react-core';
import ExternalLinkAltIcon from '@patternfly/react-icons/dist/js/icons/external-link-alt-icon';
import { selectUser } from '@app/store';
import ButtonCircleIcon from './ButtonCircleIcon';

function submitFormFromLink(e) {
  e.preventDefault();
  e.target.closest('form').submit();
}

const LabInterfaceLink: React.FC<{
  data?: object;
  method: string;
  url: string;
  variant?: 'primary' | 'secondary' | 'circle';
}> = ({ data, method, url, variant }) => {
  const user = useSelector(selectUser);
  const email = user.includes('@')
    ? user
    : user.includes('-')
    ? user.substring(0, user.lastIndexOf('-')) + '@' + user.substring(1 + user.lastIndexOf('-'))
    : `${user}@example.com`;

  if (method === 'POST') {
    return (
      <form action={url} method="POST" target="_blank">
        {Object.entries(data || {}).map(([k, v]) => (
          <input
            key={k}
            type="hidden"
            name={k}
            value={v === '{{userName}}' ? user : v == '{{userEmail}}' ? email : v}
          />
        ))}
        {variant === 'secondary' ? (
          <Button
            component="a"
            href={url}
            onClick={submitFormFromLink}
            target="_blank"
            variant={variant}
            icon={<ExternalLinkAltIcon />}
            iconPosition="right"
          >
            Lab
          </Button>
        ) : variant === 'circle' ? (
          <ButtonCircleIcon
            component="a"
            href={url}
            onClick={submitFormFromLink}
            target="_blank"
            description="Open Lab"
            icon={ExternalLinkAltIcon}
          />
        ) : (
          <a onClick={submitFormFromLink}>
            {url}
            <ExternalLinkAltIcon />
          </a>
        )}
      </form>
    );
  } else if (variant === 'secondary') {
    return (
      <Button
        component="a"
        href={url}
        onClick={() => window.open(url)}
        target="_blank"
        variant={variant}
        icon={<ExternalLinkAltIcon />}
        iconPosition="right"
      >
        Lab
      </Button>
    );
  } else if (variant === 'circle') {
    return <ButtonCircleIcon onClick={() => window.open(url)} description="Open Lab" icon={ExternalLinkAltIcon} />;
  } else {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {url} <ExternalLinkAltIcon />
      </a>
    );
  }
};

export default LabInterfaceLink;
