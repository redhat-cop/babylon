import React from 'react';
import {
  Page,
  PageSection,
  PageSectionVariants,
  TextVariants,
  Title,
  Text,
  TextListVariants,
  TextList,
  TextListItem,
  Divider,
  Sidebar,
  SidebarContent,
  SidebarPanel,
  Breadcrumb,
  BreadcrumbItem,
} from '@patternfly/react-core';
import { TableComposable, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import useSWRImmutable from 'swr/immutable';
import { CSVToArray } from '@app/util';
import { publicFetcher } from '@app/api';
import PublicHeader from '@app/Header/PublicHeader';
import SlaIcon, { SUPPORT_LEVELS } from '@app/components/SlaIcon';
import heroImg from '@app/bgimages/hero-img.jpeg';
import Hero from '@app/components/Hero';

import './technical-support-page.css';

const TechnicalSupportPage: React.FC = () => {
  const { data } = useSWRImmutable('./public/incidents_technical_support.csv', publicFetcher);
  const dataArr = CSVToArray(data);
  function getHelpLink() {
    return 'https://red.ht/open-support';
  }

  function createRowFromArr(dataLabel: string, label?: string) {
    if (typeof label === 'undefined' || label === null) {
      label = dataLabel;
    }
    return [label, ...dataArr.find((i) => i[0].startsWith(dataLabel))?.slice(1)];
  }
  const types = createRowFromArr('Types', '');
  const columns = types;
  const description = createRowFromArr('Description');
  const coverageHours = createRowFromArr('Hours of Coverage');
  const supportChannel = createRowFromArr('Support Channel');
  const responseTime = createRowFromArr('Response Time for technical support');
  const severity1 = createRowFromArr('Severity 1');
  const severity2 = createRowFromArr('Severity 2');
  const severity3 = createRowFromArr('Severity 3');
  const severity4 = createRowFromArr('Severity 4');
  const restorationTime = createRowFromArr('Restoration Time');
  const resolutionTime = createRowFromArr('Resolution Time');
  const externalDependencies = createRowFromArr('External Dependencies');
  const deploymentFailureRate = createRowFromArr('Deployment Failure Rate');
  const contentFailureRate = createRowFromArr('Content Failure Rate');

  const rows = [
    description,
    coverageHours,
    supportChannel,
    responseTime,
    severity1,
    severity2,
    severity3,
    severity4,
    restorationTime,
    resolutionTime,
    externalDependencies,
    deploymentFailureRate,
    contentFailureRate,
  ];

  return (
    <Page mainContainerId="primary-app-container" header={<PublicHeader />}>
      <PageSection variant={PageSectionVariants.light} className="technical-support-page">
        <Hero image={heroImg}>
          <Title headingLevel="h1" size="xl" style={{ fontSize: '40px' }}>
            <b>RHPDS Solution Support:</b> SLAs
          </Title>
        </Hero>
        <Breadcrumb style={{ paddingBottom: 'var(--pf-global--spacer--xl)' }}>
          <BreadcrumbItem to="/">Home</BreadcrumbItem>
          <BreadcrumbItem to="#" isActive>
            RHPDS Solution Support: SLAs
          </BreadcrumbItem>
        </Breadcrumb>
        <Sidebar hasGutter style={{ height: 'auto' }}>
          <SidebarPanel style={{ marginTop: 'auto', marginBottom: 'auto' }}>
            <div
              style={{
                paddingLeft: 'var(--pf-global--spacer--lg)',
                textAlign: 'right',
                color: 'var(--pf-global--palette--black-600)',
              }}
            >
              <em>
                “We ran a pretty intense DevSecOps 1 day-workshop for one of our Premier Partners in Germany with 8
                attendees. The workshop required to have a cluster per attendee, which was a lot of hassle for us to set
                up in the past. With RHPDS support we were able to focus on running the workshop and not on the
                infrastructure. Highly appreciated!”
              </em>
              <br />
              <p style={{ marginTop: 'var(--pf-global--spacer--xs)' }}>
                Goetz Rieger,
                <br /> Principal Solution Architect
              </p>
            </div>
          </SidebarPanel>
          <SidebarContent>
            <PageSection>
              <Title headingLevel="h2" size="lg" style={{ color: '#ee0000' }}>
                Overview
              </Title>
              <Text>
                RHPDS (Red Hat Product Demo System) is the platform which enables stakeholders, both internal and
                external (specified Partners) with the ability to run demonstrations, hands-on workshops and personal
                sandbox environments for definite time periods to showcase Red Hat’s portfolio of solutions.
              </Text>
            </PageSection>
            <PageSection>
              <Title headingLevel="h2" size="lg" style={{ color: '#ee0000' }}>
                Benefits
              </Title>
              <TextList
                component={TextListVariants.ul}
                style={{ listStyle: 'disc', marginLeft: 'var(--pf-global--spacer--lg)' }}
              >
                <TextListItem>
                  <b>Speedy restoration</b> to get your business back up and running due to Red Hat’s fast response
                  time, in the event of a production-critical issue
                </TextListItem>
                <TextListItem>
                  <b>Increased confidence</b> because of restoration and resolution service-level agreements (SLAs) that
                  guarantee restoration and resolution
                </TextListItem>
                <TextListItem>
                  <b>Efficient issue resolution</b> with direct access to senior technical engineers who are familiar
                  with your environment
                </TextListItem>
                <TextListItem>
                  <b>High availability of help</b> through a designated support channel
                </TextListItem>
              </TextList>
            </PageSection>
          </SidebarContent>
        </Sidebar>

        <PageSection>
          <TableComposable variant="compact" isStriped>
            <Thead>
              <Tr>
                {columns.map((column, columnIndex) => (
                  <Th modifier="wrap" key={columnIndex}>
                    <Text
                      component={TextVariants.h3}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        fontWeight: 700,
                        gap: 'var(--pf-global--spacer--xs)',
                      }}
                    >
                      {columnIndex > 0 ? (
                        <SlaIcon style={{ width: '24px' }} level={SUPPORT_LEVELS[columnIndex - 1]} />
                      ) : null}
                      {column}
                    </Text>
                  </Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((row, rowIndex) => (
                <Tr key={rowIndex}>
                  {columns.map((_, columnIndex) => (
                    <Td width={10} key={`row-${columnIndex}`} dataLabel={columns[columnIndex]}>
                      {row[columnIndex]}
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </TableComposable>
          <Text component={TextVariants.p} style={{ padding: 'var(--pf-global--spacer--md)' }}>
            <a href={getHelpLink()} target="_blank" rel="noopener noreferrer">
              Contact us
            </a>{' '}
            for more information about RHPDS Solution Support.
          </Text>
          <Divider />
          <TextList
            component={TextListVariants.ul}
            style={{ lineHeight: 1.1, padding: 'var(--pf-global--spacer--xs)' }}
          >
            <TextListItem>
              <Text component={TextVariants.small}>Does not include external dependencies</Text>
            </TextListItem>
            <TextListItem>
              <Text component={TextVariants.small}>Does not include Australia</Text>
            </TextListItem>
            <TextListItem>
              <Text component={TextVariants.small}>Excluding regional holidays</Text>
            </TextListItem>
            <TextListItem>
              <Text component={TextVariants.small}>
                Excluded from Support are external dependencies and functionalities that enable the user to perform
                modifications to the base environments, such as: LE, Quay, OpenShift Container Registry, Run as an OPEN
                Environment, etc
              </Text>
            </TextListItem>
          </TextList>
        </PageSection>
      </PageSection>
    </Page>
  );
};

export default TechnicalSupportPage;
