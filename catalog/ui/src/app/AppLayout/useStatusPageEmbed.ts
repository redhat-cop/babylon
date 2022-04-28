import { useEffect } from 'react';
import useScript from '@app/utils/useScript';
import { useLocation } from 'react-router-dom';

function useStatusPageEmbed(): void {
  const STATUS_PAGE_ID = process.env.STATUS_PAGE_ID;
  if (!STATUS_PAGE_ID) {
    console.error('statuspage.io ID not defined');
  }
  useScript(`https://${STATUS_PAGE_ID}.statuspage.io/embed/script.js`);
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
        }
      }
    }
    hideAlertMsg();
  }, [location, STATUS_PAGE_ID]);

  return null;
}

export default useStatusPageEmbed;
