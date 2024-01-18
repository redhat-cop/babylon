import { useEffect, useState } from 'react';
import useScript from '@app/utils/useScript';
import { useLocation } from 'react-router-dom';
import useInterfaceConfig from '@app/utils/useInterfaceConfig';

function useStatusPageEmbed(): void {
  const { status_page_id } = useInterfaceConfig();
  if (!status_page_id) {
    console.info('statuspage.io ID not defined');
  }
  const [visible, setVisible] = useState(status_page_id ? true : false);
  useScript(status_page_id ? `https://${status_page_id}.statuspage.io/embed/script.js` : '');
  const location = useLocation();

  useEffect(() => {
    function hideAlertMsg() {
      for (const iframe of document.getElementsByTagName('iframe')) {
        if (iframe.getAttribute('src') && iframe.getAttribute('src').includes(status_page_id)) {
          if (iframe.style.left !== 'auto') {
            iframe.style.left = `-${iframe.style.width}`;
          } else {
            iframe.style.right = `-${iframe.style.width}`;
          }
          setVisible(false);
        }
      }
    }
    if (visible) {
      hideAlertMsg();
    }
  }, [location, visible]);

  return null;
}

export default useStatusPageEmbed;
