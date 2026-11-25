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
          // eslint-disable-next-line @eslint-react/no-array-index-key -- provision history entries have no identity (only a result string) and are rendered as fixed positional cells
          return <div key={idx} style={{ backgroundColor: '#5ba352' }}></div>;
        } else {
          // eslint-disable-next-line @eslint-react/no-array-index-key -- provision history entries have no identity (only a result string) and are rendered as fixed positional cells
          return <div key={idx} style={{ backgroundColor: '#df2020' }}></div>;
        }
      })}
    </div>
  );
};

export default CatalogItemHealthDisplay;
