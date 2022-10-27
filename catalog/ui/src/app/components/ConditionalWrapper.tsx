import React from 'react';

type ConditionalWrapperProps = {
  children: JSX.Element;
  condition: boolean;
  wrapper: (children: JSX.Element) => JSX.Element;
};
const ConditionalWrapper: React.FC<ConditionalWrapperProps> = ({ condition, wrapper, children }) =>
  condition ? React.cloneElement(wrapper(children)) : children;

export default ConditionalWrapper;
