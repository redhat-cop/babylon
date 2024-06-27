import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const DEFAULT_USER_INTERFACE = 'rhpds';

function getPageTitle(title: string, userInterface?: string): string {
  if (!userInterface) userInterface = DEFAULT_USER_INTERFACE;
  return userInterface === 'summit'
    ? title.replace('Babylon', 'Red Hat Summit')
    : ['rhpds', 'rhdp', 'rhdp-partners'].includes(userInterface)
      ? title.replace('Babylon', 'Red Hat Demo Platform')
      : title;
}

// a custom hook for setting the page title
function useDocumentTitle(title: string): void {
  const [searchParams] = useSearchParams();
  const userInterface = searchParams.get('userInterface');
  useEffect(() => {
    const originalTitle = document.title;
    if (title) document.title = getPageTitle(title, userInterface);

    return () => {
      document.title = originalTitle;
    };
  }, [title, userInterface]);
}

export default useDocumentTitle;
