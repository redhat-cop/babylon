import * as React from 'react';

export interface CatalogItemHealthDisplayProps {
  catalogItem: any;
}

const CatalogItemHealthDisplay: React.FunctionComponent<CatalogItemHealthDisplayProps> = ({ catalogItem }) => {
  return (
    <div
      style={{
        display: 'grid',
        gap: '3px',
        gridTemplateColumns: '7px 7px 7px 7px 7px 7px 7px 7px 7px 7px',
        height: '18px',
        width: '100px',
      }}
    >
      {catalogItem.status.provisionHistory.map((provision, idx) => {
        if (provision.result === 'success') {
          return <div key={idx} style={{ backgroundColor: '#5ba352' }}></div>;
        } else {
          return <div key={idx} style={{ backgroundColor: '#df2020' }}></div>;
        }
      })}
    </div>
  );
};

export default CatalogItemHealthDisplay;
