import React from 'react';
import { Button } from '@patternfly/react-core';
import RedoIcon from '@patternfly/react-icons/dist/js/icons/redo-icon';

const RefreshButton: React.FunctionComponent<{
  onClick: () => void;
}> = ({ onClick }) => {
  return (
    <Button icon={<RedoIcon />} onClick={() => onClick()} variant="tertiary">
      Refresh
    </Button>
  );
};

export default RefreshButton;
