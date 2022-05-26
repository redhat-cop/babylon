import React from 'react';
import { Button, Tooltip, ButtonProps } from '@patternfly/react-core';
import { SVGIconProps } from '@patternfly/react-icons/dist/js/createIcon';

import './button-circle-icon.css';

const ButtonCircleIcon: React.FC<
  ButtonProps & {
    icon: React.ComponentClass<SVGIconProps>;
    description: string;
  }
> = ({ icon, isDisabled = false, description, onClick, ...rest }) => {
  const Icon = icon;
  return (
    <Tooltip position="bottom" content={description}>
      <Button
        {...rest}
        isDisabled={isDisabled}
        aria-label={description}
        onClick={onClick}
        variant="plain"
        className="button-circle-icon"
      >
        <Icon color="#6A6E73" />
      </Button>
    </Tooltip>
  );
};

export default ButtonCircleIcon;
