import React, { useCallback, useEffect, useState } from 'react';
import ShareSquareIcon from '@patternfly/react-icons/dist/js/icons/share-square-icon';
import CopyIcon from '@patternfly/react-icons/dist/js/icons/copy-icon';
import { Button, TextInput, Tooltip } from '@patternfly/react-core';
import Modal, { useModal } from '@app/Modal/Modal';

const ShareLink: React.FC<{
  url?: URL;
  name: string;
}> = ({ url: _url, name }) => {
  const [modal, openModal] = useModal();
  const [copied, setCopied] = useState(false);
  const url = _url || new URL(window.location.href);
  url.searchParams.append('utm_source', 'webapp');
  url.searchParams.append('utm_medium', 'share-link');
  const urlString = decodeURIComponent(url.toString());

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
  }, [url]);

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
    <>
      <Modal ref={modal} title={`Share ${name}`} onConfirm={null} type="ack">
        <div style={{ display: 'flex', flexDirection: 'row' }}>
          <TextInput type="text" isDisabled value={urlString} aria-label={urlString} />
          <Tooltip position="bottom" content={<div>{copied ? `Copied` : `Copy to clipboard`}</div>}>
            <Button variant="control" aria-label="Copy" onClick={handleCopy}>
              <CopyIcon />
            </Button>
          </Tooltip>
        </div>
      </Modal>
      <Tooltip position="bottom" content={<div>Share {name}</div>}>
        <Button onClick={openModal} variant="control" aria-label="Share">
          <ShareSquareIcon />
        </Button>
      </Tooltip>
    </>
  );
};

export default ShareLink;
