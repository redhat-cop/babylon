import React, { useEffect, useState } from 'react';
import { renderContent, stripHtml } from '@app/util';
import type { RenderContentOpt } from '@app/util';

// Keep conversion outside React rendering and discard results for superseded content.
const RenderedContent: React.FC<{
  content: string;
  options?: RenderContentOpt;
  className?: string;
  maxLength?: number;
  children?: (html: string) => React.ReactNode;
}> = ({ content, options = {}, className, maxLength, children }) => {
  const key = JSON.stringify([content, options]);
  const [result, setResult] = useState<{ key: string; html: string; failed?: boolean }>();

  useEffect(() => {
    let active = true;
    const [source, settings] = JSON.parse(key);
    renderContent(source, settings).then(
      (html) => {
        if (active) setResult({ key, html });
      },
      () => {
        if (active) setResult({ key, html: '', failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [key]);

  if (result?.key !== key) return <span role="status">Loading content…</span>;
  if (result.failed) return <span role="alert">Unable to display this content.</span>;
  if (children) return <>{children(result.html)}</>;
  if (maxLength !== undefined) return <>{stripHtml(result.html).trim().slice(0, maxLength)}</>;
  return <div className={className} dangerouslySetInnerHTML={{ __html: result.html }} />;
};

export default RenderedContent;
