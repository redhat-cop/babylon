import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NotificationDrawerContextType {
  notificationDrawer: React.ReactNode | null;
  isDrawerExpanded: boolean;
  setIsDrawerExpanded: (expanded: boolean) => void;
  setNotificationDrawer: (drawer: React.ReactNode | null) => void;
}

const NotificationDrawerContext = createContext<NotificationDrawerContextType | undefined>(undefined);

export const NotificationDrawerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notificationDrawer, setNotificationDrawer] = useState<React.ReactNode | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

  return (
    <NotificationDrawerContext.Provider
      value={{
        notificationDrawer,
        isDrawerExpanded,
        setIsDrawerExpanded,
        setNotificationDrawer,
      }}
    >
      {children}
    </NotificationDrawerContext.Provider>
  );
};

export const useNotificationDrawer = () => {
  const context = useContext(NotificationDrawerContext);
  return context; // Return undefined if not provided, so components can check
};

export default NotificationDrawerContext;

