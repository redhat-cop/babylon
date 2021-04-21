import * as React from 'react';

import {
  Button,
} from '@patternfly/react-core';

import {
  TrashIcon,
} from '@patternfly/react-icons';

export interface DeleteButtonProps {
  onClick: any;
}

const DeleteButton: React.FunctionComponent<DeleteButtonProps> = ({
  onClick,
}) => {
  return (
    <Button
      variant="danger" onClick={onClick}>Delete <TrashIcon/>
    </Button>
  );
}

export { DeleteButton };
