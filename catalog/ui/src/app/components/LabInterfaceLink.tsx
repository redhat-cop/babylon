import * as React from 'react';

import {
  ExternalLinkAltIcon,
} from '@patternfly/react-icons';

import {
  useSelector,
} from 'react-redux';

import {
  Button,
  ButtonVariant
} from '@patternfly/react-core';

import {
  selectUser,
} from '@app/store';

export interface LabInterfaceLinkProps {
  data?: object;
  method: string;
  url: string;
  variant?: ButtonVariant | 'primary' |'secondary';
}

function submitFormFromLink(e) {
  e.preventDefault();
  e.target.closest('form').submit();
}

const LabInterfaceLink: React.FunctionComponent<LabInterfaceLinkProps> = ({
  data,
  method,
  url,
  variant,
}) => {
  const user = useSelector(selectUser);
  const email = user.includes('@') ? user : user.includes('-') ? user.substring(0, user.lastIndexOf('-')) + '@' + user.substring(1 + user.lastIndexOf('-')) : `${user}@example.com`;

  if (method === 'POST') {
    return (
      <form action={url} method="POST" target="_blank">
        { Object.entries(data || {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v === '{{userName}}' ? user : v == '{{userEmail}}' ? email : v}/>
        )) }
        { variant ? (
          <Button
            component="a"
            href={url}
            onClick={submitFormFromLink}
            target="_blank"
            variant={variant}
            icon={<ExternalLinkAltIcon/>}
            iconPosition="right"
          >Lab</Button>
        ) : (
          <a onClick={submitFormFromLink}>{url}<ExternalLinkAltIcon/></a>
        ) }
      </form>
    );
  } else if(variant) {
    return (
      <Button
        component="a"
        href={url}
        onClick={() => window.open(url)}
        target="_blank"
        variant={variant}
        icon={<ExternalLinkAltIcon/>}
        iconPosition="right"
      >Lab</Button>
    );
  } else {
    return (
      <a href={url} target="_blank">{url} <ExternalLinkAltIcon/></a>
    );
  }
}

export { LabInterfaceLink };
