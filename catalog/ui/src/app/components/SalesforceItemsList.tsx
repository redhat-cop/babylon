import React from 'react';
import { List, ListItem } from '@patternfly/react-core';
import type { SalesforceItem } from '@app/types';

interface SalesforceItemsListProps {
  items: SalesforceItem[];
}

const SalesforceItemsList: React.FC<SalesforceItemsListProps> = ({ items }) => {
  if (!items || items.length === 0) {
    return null;
  }

  const getTypeLabel = (type: string) => {
    return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Salesforce';
  };

  return (
    <List isPlain>
      {items.filter(item => item.type && item.id).map((item, idx) => (
        <ListItem key={`${item.id}-${idx}`}>
          <span style={{ fontWeight: 'bold' }}>{getTypeLabel(item.type)} Id</span>: {item.id}
        </ListItem>
      ))}
    </List>
  );
};

export default SalesforceItemsList;

