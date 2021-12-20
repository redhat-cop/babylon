import classNames from 'classnames';
import * as React from 'react';

import './loading-icon.css';

type LoadingIconProps = {
  className?: string;
};

const LoadingIcon: React.FunctionComponent<LoadingIconProps> = ({ className }) => (
  <div
    className={classNames('co-m-loader', className)}
    data-test="loading-indicator"
  >
    <div className="co-m-loader-dot__one" />
    <div className="co-m-loader-dot__two" />
    <div className="co-m-loader-dot__three" />
  </div>
);

export default LoadingIcon;
