import React, { useMemo } from 'react';
import yaml from 'js-yaml';
import {
  Bullseye,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  PageSection,
  PageSectionVariants,
  Panel,
  PanelMain,
  PanelMainBody,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import ExternalLinkAltIcon from '@patternfly/react-icons/dist/js/icons/external-link-alt-icon';
import { renderContent } from '@app/util';
import EditorViewer from '@app/components/Editor/EditorViewer';
import Hero from '@app/components/Hero';
import heroImg from '@app/bgimages/hero-img.jpeg';
import { WorkshopDetails } from './workshopApi';
import { createAsciiDocAttributes } from '@app/Services/service-utils';
import { MessageTemplate } from '@app/types';
import AdocWrapper from '@app/components/AdocWrapper';

import './workshop-content.css';

const WorkshopContent: React.FC<{
  workshop: WorkshopDetails;
}> = ({ workshop }) => {
  const description = workshop.description;
  const displayName = workshop.displayName || 'Workshop';
  const userAssignment = workshop.assignment;
  const labUserInterfaceRedirect = workshop.labUserInterfaceRedirect;
  const infoMessageTemplate = JSON.parse(workshop.template) as MessageTemplate;
  let renderEditor = true;

  const templateHtml = useMemo(() => {
    if (!infoMessageTemplate || !userAssignment?.data) return null;
    const htmlRenderedTemplate = renderContent(infoMessageTemplate.template, {
      format: infoMessageTemplate.templateFormat,
      vars: createAsciiDocAttributes(userAssignment.data, '--'),
    });
    return (
      <div style={{ padding: '0 var(--pf-global--spacer--md) var(--pf-global--spacer--md)' }}>
        <AdocWrapper html={htmlRenderedTemplate} />
      </div>
    );
  }, [infoMessageTemplate, JSON.stringify(userAssignment.data)]);

  const userAssignmentMessagesHtml = useMemo(
    () =>
      userAssignment.messages ? (
        <div
          dangerouslySetInnerHTML={{
            __html: renderContent(userAssignment.messages.replace(/\n/g, '  +\n'), { format: 'asciidoc' }),
          }}
        />
      ) : null,
    [userAssignment.messages],
  );

  if (userAssignment.labUserInterface?.url && labUserInterfaceRedirect === true) {
    window.location.href = userAssignment.labUserInterface.url;
  }

  try {
    JSON.parse(description);
  } catch {
    renderEditor = false;
  }

  return (
    <PageSection variant={PageSectionVariants.light} className="workshop-content" padding={{ default: 'noPadding' }}>
      <Hero image={heroImg}>
        <Title headingLevel="h1" size="xl" style={{ fontSize: '40px' }}>
          <b>{displayName}</b>
        </Title>
      </Hero>
      <Stack hasGutter className="workshop-content__wrapper">
        <StackItem>
          <Bullseye>
            <Title headingLevel="h3" className="workshop-content__title">
              Instructions for {displayName}
            </Title>
          </Bullseye>
        </StackItem>
        {description ? (
          <StackItem className="workshop-content__description">
            <div>
              {renderEditor ? (
                <EditorViewer value={description} />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: renderContent(description, { format: 'html' }) }} />
              )}
            </div>
          </StackItem>
        ) : null}
        <StackItem>
          <Bullseye>
            <DescriptionList isHorizontal>
              {userAssignment.labUserInterface ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Lab User Interface</DescriptionListTerm>
                  <DescriptionListDescription>
                    <a href={userAssignment.labUserInterface.url} target="_blank" rel="noreferrer">
                      {userAssignment.labUserInterface.url} <ExternalLinkAltIcon />
                    </a>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {templateHtml ? null : (
                <>
                  {userAssignment.messages ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Messages</DescriptionListTerm>
                      <DescriptionListDescription>{userAssignmentMessagesHtml}</DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}
                  {userAssignment.data ? (
                    <DescriptionListGroup>
                      <DescriptionListTerm>Data</DescriptionListTerm>
                      <DescriptionListDescription>
                        <pre>
                          {yaml.dump(
                            Object.keys(userAssignment.data).length === 1
                              ? userAssignment.data[Object.keys(userAssignment.data)[0]]
                              : userAssignment.data,
                          )}
                        </pre>
                      </DescriptionListDescription>
                    </DescriptionListGroup>
                  ) : null}
                </>
              )}
            </DescriptionList>
            {templateHtml ? (
              <Panel>
                <PanelMain>
                  <PanelMainBody>{templateHtml}</PanelMainBody>
                </PanelMain>
              </Panel>
            ) : null}
          </Bullseye>
        </StackItem>
      </Stack>
    </PageSection>
  );
};

export default WorkshopContent;
