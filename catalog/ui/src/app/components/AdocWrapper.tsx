import React from 'react';

import './adoc-wrapper.css';

const AdocWrapper: React.FC<{
  html: string;
}> = ({ html }) => {
  return (
    <div
      className="adoc-wrapper__content"
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- all callers pass RenderedContent output, which is sanitized by DOMPurify in renderContent() (plus a static spinner SVG)
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    />
  );
};

export default AdocWrapper;
