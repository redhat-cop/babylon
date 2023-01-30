import React, { useCallback, useEffect, useState } from 'react';
import CopyIcon from '@patternfly/react-icons/dist/js/icons/copy-icon';
import { Button, TextArea, TextInput, Tooltip } from '@patternfly/react-core';

const CopyToClipboard: React.FC<{
  text: string;
}> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }, [text]);

  useEffect(() => {
    let timer = null;
    if (copied) {
      timer = setTimeout(setCopied, 2000, false);
    }
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  return (
    <div style={{ display: 'flex', flexDirection: 'row' }}>
      <TextArea type="text" readOnlyVariant="default" value={text} aria-label={text} autoResize={true} />
      <Tooltip position="bottom" content={<div>{copied ? `Copied` : `Copy to clipboard`}</div>}>
        <Button
          variant="control"
          aria-label="Copy"
          onClick={handleCopy}
          style={{
            maxHeight: '36px',
            marginTop: 'auto',
          }}
        >
          <CopyIcon />
        </Button>
      </Tooltip>
    </div>
  );
};

export default CopyToClipboard;
