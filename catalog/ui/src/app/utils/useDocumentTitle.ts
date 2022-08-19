import { useEffect } from 'react';

// a custom hook for setting the page title
function useDocumentTitle(title: string): void {
  useEffect(() => {
    const originalTitle = document.title;
    if (title) {
      document.title = title;
    }

    return () => {
      document.title = originalTitle;
    };
  }, [title]);
}

export default useDocumentTitle;
