import React from 'react';
import ShareSquareIcon from '@patternfly/react-icons/dist/js/icons/share-square-icon';
import { Button, Tooltip } from '@patternfly/react-core';
import Modal, { useModal } from '@app/Modal/Modal';
import CopyToClipboard from './CopyToClipboard';

const ShareLink: React.FC<{
  url?: URL;
  name: string;
}> = ({ url: _url, name }) => {
  const [modal, openModal] = useModal();
  const url = _url || new URL(window.location.href);
  url.searchParams.append('utm_source', 'webapp');
  url.searchParams.append('utm_medium', 'share-link');
  const urlString = decodeURIComponent(url.toString());

  return (
    <>
      <Modal ref={modal} title={`Share ${name}`} onConfirm={null} type="ack">
        <CopyToClipboard text={urlString} />
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
