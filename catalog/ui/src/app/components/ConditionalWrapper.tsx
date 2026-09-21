import React, { ReactElement } from 'react';

type ConditionalWrapperProps = {
  children: ReactElement;
  condition: boolean;
  wrapper: (children: ReactElement) => ReactElement;
};
const ConditionalWrapper: React.FC<ConditionalWrapperProps> = ({ condition, wrapper, children }) =>
  condition ? React.cloneElement(wrapper(children)) : children;

export default ConditionalWrapper;
