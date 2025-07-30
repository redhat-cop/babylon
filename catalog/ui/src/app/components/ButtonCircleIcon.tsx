import React from 'react';
import { Button, Tooltip, ButtonProps } from '@patternfly/react-core';
import { SVGIconProps } from '@patternfly/react-icons/dist/js/createIcon';

import './button-circle-icon.css';

const ButtonCircleIcon: React.FC<
  Omit<ButtonProps, 'icon'> & {
    icon: React.ComponentClass<SVGIconProps>;
    description: string;
  }
> = ({ icon, isDisabled = false, description, onClick, ...rest }) => {
  const Icon = icon;
  return (
    <Tooltip position="bottom" content={description}>
      <Button icon={<Icon color="#6A6E73" />}
        {...rest}
        isDisabled={isDisabled}
        aria-label={description}
        onClick={onClick}
        variant="plain"
        className="button-circle-icon"
       />
    </Tooltip>
  );
};

export default ButtonCircleIcon;
