import React from 'react';

const CatalogItemHealthDisplay: React.FunctionComponent<{
  provisionHistory: { result?: string }[];
}> = ({ provisionHistory }) => {
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
      {provisionHistory.map((provision, idx) => {
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
