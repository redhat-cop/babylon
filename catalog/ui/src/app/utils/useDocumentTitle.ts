import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const DEFAULT_USER_INTERFACE = 'rhpds';

function getPageTitle(title: string, userInterface?: string): string {
  if (!userInterface) userInterface = DEFAULT_USER_INTERFACE;
  return userInterface === 'summit'
    ? title.replace('Babylon', 'Red Hat Summit')
    : userInterface === 'rhpds'
    ? title.replace('Babylon', 'Red Hat Demo Platform')
    : title;
}

// a custom hook for setting the page title
function useDocumentTitle(title: string): void {
  const { search } = useLocation();
  const userInterface = new URLSearchParams(search).get('userInterface');
  useEffect(() => {
    const originalTitle = document.title;
    if (title) document.title = getPageTitle(title, userInterface);

    return () => {
      document.title = originalTitle;
    };
  }, [title, userInterface]);
}

export default useDocumentTitle;
