import React from 'react';

import './loading-icon.css';

const LoadingIcon: React.FC<{
  className?: string;
}> = ({ className }) => (
  <div className={`co-m-loader${className ? ` ${className}` : ''}`} data-test="loading-indicator">
    <div className="co-m-loader-dot__one" />
    <div className="co-m-loader-dot__two" />
    <div className="co-m-loader-dot__three" />
  </div>
);

export default LoadingIcon;
