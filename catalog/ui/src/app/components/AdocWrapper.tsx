import React from 'react';

import './adoc-wrapper.css';

const AdocWrapper: React.FC<{
  html: string;
}> = ({ html }) => {
  return (
    <div
      className="adoc-wrapper__content"
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    />
  );
};

export default AdocWrapper;
