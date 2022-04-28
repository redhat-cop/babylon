import { useEffect, useState } from 'react';
import useScript from '@app/utils/useScript';
import { useLocation } from 'react-router-dom';

const STATUS_PAGE_ID = process.env.STATUS_PAGE_ID;

function useStatusPageEmbed(): void {
  if (!STATUS_PAGE_ID) {
    console.error('statuspage.io ID not defined');
  }
  const [visible, setVisible] = useState(STATUS_PAGE_ID ? true : false);
  useScript(STATUS_PAGE_ID ? `https://${STATUS_PAGE_ID}.statuspage.io/embed/script.js` : '');
  const location = useLocation();

  useEffect(() => {
    function hideAlertMsg() {
      for (const iframe of document.getElementsByTagName('iframe')) {
        if (iframe.getAttribute('src').includes(STATUS_PAGE_ID)) {
          if (iframe.style.left !== 'auto') {
            iframe.style.left = '-320px';
          } else {
            iframe.style.right = '-320px';
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
