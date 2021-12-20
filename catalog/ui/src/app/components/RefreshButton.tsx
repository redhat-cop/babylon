import React from "react";
import { Button } from '@patternfly/react-core';
import { RedoIcon } from '@patternfly/react-icons';

export interface RefreshButtonProps {
  onClick: () => void;
}

const RefreshButton: React.FunctionComponent<RefreshButtonProps> = ({
  onClick,
}) => {
  return (
    <Button
      icon={<RedoIcon/>}
      onClick={() => onClick()}
      variant="tertiary"
    >Refresh</Button>
  );
}

export default RefreshButton;
