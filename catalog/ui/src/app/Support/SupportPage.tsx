import React from 'react';
import {
  Page,
  PageSection,
  ContentVariants,
  Title,
  Content,
  Divider,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Breadcrumb,
  BreadcrumbItem,
  Tooltip,
} from '@patternfly/react-core';
import { Table /* data-codemods */, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import useSWRImmutable from 'swr/immutable';
import { CSVToArray } from '@app/util';
import { publicFetcher } from '@app/api';
import useDocumentTitle from '@app/utils/useDocumentTitle';
import PublicHeader from '@app/Header/PublicHeader';
import Footer from '@app/components/Footer';
import Hero from '@app/components/Hero';
import heroImg from '@app/bgimages/hero-img.jpeg';

import './support-page.css';
import OutlinedQuestionCircleIcon from '@patternfly/react-icons/dist/js/icons/outlined-question-circle-icon';

const SupportPage: React.FC<{ title: string }> = ({ title }) => {
  useDocumentTitle(title);
  const { data } = useSWRImmutable('./public/incidents_technical_support.csv', publicFetcher);
  const dataArr = CSVToArray(data);
  function getHelpLink() {
    return 'https://red.ht/open-support';
  }

  function createColumnsFromArr(dataLabel: string, label?: string) {
    if (typeof label === 'undefined' || label === null) {
      label = dataLabel;
    }
    return [label, ...dataArr.find((i) => i[0].startsWith(dataLabel))?.slice(1)];
  }
  function createRowFromArr(dataLabel: string, label?: string) {
    if (typeof label === 'undefined' || label === null) {
      label = dataLabel;
    }
    const arr = dataArr.find((i) => i[0].startsWith(dataLabel));
    const tooltipDescription = arr[0].match(/\((.*)\)/);
    if (tooltipDescription) {
      return [
        <div key={label}>
          {label}{' '}
          <Tooltip position="right" content={<div>{tooltipDescription[0].slice(1, -1)}</div>} key={label}>
            <OutlinedQuestionCircleIcon
              aria-label={tooltipDescription[0].slice(1, -1)}
              className="tooltip-icon-only"
              style={{ marginLeft: 'var(--pf-t--global--spacer--xs)', width: '10px' }}
            />
          </Tooltip>
        </div>,
        ...arr?.slice(1),
      ];
    }
    return [label, ...arr?.slice(1)];
  }
  const columns = createColumnsFromArr('Types', '');
  const description = createRowFromArr('Description');
  const requirements = createRowFromArr('Requirements');
  const supportTools = createRowFromArr('Customer-Facing Support Tools');
  const responseTime = createRowFromArr('Request/Incident Response Time');
  const resolutionTimePlatformHeading = createRowFromArr('Incident Resolution Time - Platform');
  const severity1 = createRowFromArr('Severity 1');
  const severity2 = createRowFromArr('Severity 2');
  const resolutionTimeContentHeading = createRowFromArr('Incident Resolution Time - Content');
  const severity3 = createRowFromArr('Severity 3');
  const severity4 = createRowFromArr('Severity 4');
  const restorationTime = createRowFromArr('Restoration Time');
  const resolutionTimeForRHDP = createRowFromArr('Resolution Time');
  const failureRate = createRowFromArr('Deployment Failure Rate');

  const rows = [
    description,
    requirements,
    supportTools,
    responseTime,
    resolutionTimePlatformHeading,
    severity1,
    severity2,
    resolutionTimeContentHeading,
    severity3,
    severity4,
    restorationTime,
    resolutionTimeForRHDP,
    failureRate,
  ];
  const headingIndexes = [4, 7];
  const combinedRows = [5, 6];

  return (
    <Page mainContainerId="primary-app-container" masthead={<PublicHeader />}>
      <PageSection hasBodyWrapper={false} className="support-page">
        <Hero image={heroImg}>
          <Title headingLevel="h1" size="xl" style={{ fontSize: '40px' }}>
            <b>Solution Support:</b> Service Level
          </Title>
        </Hero>
        <div className="page-container">
          <Breadcrumb style={{ paddingBottom: 'var(--pf-t--global--spacer--xl)' }}>
            <BreadcrumbItem to="/">Home</BreadcrumbItem>
            <BreadcrumbItem to="#" isActive>
              Solution Support: Service Level
            </BreadcrumbItem>
          </Breadcrumb>
          <Sidebar hasGutter style={{ height: 'auto' }}>
            <SidebarPanel style={{ marginTop: 'auto', marginBottom: 'auto' }}>
              <div
                style={{
                  paddingLeft: 'var(--pf-t--global--spacer--lg)',
                  textAlign: 'right',
                  color: 'var(--pf-t--color--gray--60)' /* CODEMODS: original v5 color was --pf-t--color--gray--60 */,
                }}
              >
                <em>
                  “We ran a pretty intense DevSecOps 1 day-workshop for one of our Premier Partners in Germany with 8
                  attendees. The workshop required to have a cluster per attendee, which was a lot of hassle for us to
                  set up in the past. With Red Hat Demo Platform support we were able to focus on running the workshop
                  and not on the infrastructure. Highly appreciated!”
                </em>
                <br />
                <p style={{ marginTop: 'var(--pf-t--global--spacer--xs)' }}>
                  Goetz Rieger,
                  <br /> Principal Solution Architect
                </p>
              </div>
            </SidebarPanel>
            <SidebarContent>
              <PageSection hasBodyWrapper={false}>
                <Title headingLevel="h2" size="lg" style={{ color: '#ee0000' }}>
                  Overview
                </Title>
                <Content component="p">
                  Red Hat Demo Platform helps you confidently plan and host customer-facing events with assistance from
                  experienced support engineers and architects.
                </Content>
              </PageSection>
              <PageSection hasBodyWrapper={false}>
                <Title headingLevel="h2" size="lg" style={{ color: '#ee0000' }}>
                  Benefits
                </Title>
                <Content
                  component={ContentVariants.ul}
                  style={{ listStyle: 'disc', marginLeft: 'var(--pf-t--global--spacer--lg)' }}
                >
                  <Content component="li">Reliable and speedy deployment (minutes instead of hours)</Content>
                  <Content component="li">Customer-facing workshop support from our team</Content>
                  <Content component="li">24/5 global monitoring of all tickets</Content>
                  <Content component="li">More coming soon</Content>
                </Content>
              </PageSection>
            </SidebarContent>
          </Sidebar>

          <PageSection hasBodyWrapper={false} style={{ paddingBottom: 'var(--pf-t--global--spacer--4xl)' }}>
            <Table variant="compact" isStriped>
              <Thead>
                <Tr>
                  {columns.map((column, columnIndex) => (
                    <Th modifier="wrap" key={columnIndex}>
                      <Content
                        component={ContentVariants.h3}
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          fontWeight: 700,
                          gap: 'var(--pf-t--global--spacer--sm)',
                        }}
                      >
                        {column}
                      </Content>
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((row, rowIndex) => (
                  <Tr key={rowIndex}>
                    {columns.map((_, columnIndex) => (
                      <Td
                        width={10}
                        key={`row-${columnIndex}`}
                        dataLabel={columns[columnIndex]}
                        style={{
                          fontWeight: headingIndexes.includes(rowIndex) ? 700 : 400,
                          textAlign: combinedRows.includes(rowIndex) && columnIndex > 0 ? 'right' : 'left',
                        }}
                      >
                        {row[columnIndex]}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <Content component={ContentVariants.p} style={{ padding: 'var(--pf-t--global--spacer--md)' }}>
              <a href={getHelpLink()} target="_blank" rel="noopener noreferrer">
                Contact us
              </a>{' '}
              for more information about RHDP Solution Support.
            </Content>
            <Divider />
            <Content
              component={ContentVariants.ul}
              style={{ lineHeight: 1.1, padding: 'var(--pf-t--global--spacer--xs)' }}
            >
              <Content component="li">
                <Content component={ContentVariants.small}>Does not include external dependencies</Content>
              </Content>
              <Content component="li">
                <Content component={ContentVariants.small}>Does not include Australia</Content>
              </Content>
              <Content component="li">
                <Content component={ContentVariants.small}>Excluding regional holidays</Content>
              </Content>
              <Content component="li">
                <Content component={ContentVariants.small}>
                  Excluded from Support are external dependencies and functionalities that enable the user to perform
                  modifications to the base environments, such as: LE, Quay, OpenShift Container Registry, Run as an
                  OPEN Environment, etc
                </Content>
              </Content>
            </Content>
          </PageSection>
        </div>
      </PageSection>
      <Footer />
    </Page>
  );
};

export default SupportPage;
