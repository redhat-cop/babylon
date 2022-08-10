import React, { useState } from 'react';
import { PageSection, PageSectionVariants, Title } from '@patternfly/react-core';
import useSWRImmutable from 'swr/immutable';
import { fetcher } from '@app/api';

import './technical-support-page.css';
import { CSVToArray } from '@app/util';
import { TableComposable, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';

const TechnicalSupportPage: React.FC<{
  supportType?: string;
}> = ({ supportType }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { data } = useSWRImmutable('./incidents_technical_support.csv', fetcher);
  const dataArr = CSVToArray(data);
  const columns = [];
  const rows = [];
  return (
    <PageSection variant={PageSectionVariants.light} className="technical-support-page">
      <Title headingLevel="h1" size="lg">
        Support
      </Title>
      {dataArr}
      <TableComposable variant="compact" aria-label="Sortable Table">
        <Thead>
          <Tr>
            {columns.map((column, columnIndex) => (
              <Th key={columnIndex}>{column}</Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row, rowIndex) => (
            <Tr key={rowIndex}>
              <>
                <Td dataLabel={columns[0]}>{row[0]}</Td>
                <Td dataLabel={columns[1]}>{row[1]}</Td>
                <Td dataLabel={columns[2]}>{row[2]}</Td>
                <Td dataLabel={columns[3]}>{row[3]}</Td>
              </>
            </Tr>
          ))}
        </Tbody>
      </TableComposable>
    </PageSection>
  );
};

export default TechnicalSupportPage;
