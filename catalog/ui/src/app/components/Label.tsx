import React from 'react';
import { Tooltip } from '@patternfly/react-core';

const Label: React.FC<{ tooltipDescription?: JSX.Element; children: React.ReactNode }> = ({
  children,
  tooltipDescription = null,
}) =>
  children && tooltipDescription ? (
    <Tooltip position="bottom" content={tooltipDescription}>
      <span
        style={{
          backgroundColor: '#faeae8',
          borderRadius: '10px',
          color: '#7d1007',
          fontWeight: 300,
          fontSize: '12px',
          padding: '0 8px',
          margin: '0 8px',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
    </Tooltip>
  ) : children ? (
    <span
      style={{
        backgroundColor: '#faeae8',
        borderRadius: '10px',
        color: '#7d1007',
        fontWeight: 300,
        fontSize: '12px',
        padding: '0 8px',
        margin: '0 8px',
      }}
    >
      {children}
    </span>
  ) : null;

export default Label;
