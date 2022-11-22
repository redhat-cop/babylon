import React from 'react';
import yaml from 'js-yaml';
import {
  Bullseye,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  PageSection,
  PageSectionVariants,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import ExternalLinkAltIcon from '@patternfly/react-icons/dist/js/icons/external-link-alt-icon';
import { renderContent } from '@app/util';
import EditorViewer from '@app/components/Editor/EditorViewer';
import { WorkshopDetails } from './workshopApi';

const WorkshopAccess: React.FC<{
  workshop: WorkshopDetails;
}> = ({ workshop }) => {
  const description = workshop.description;
  const displayName = workshop.displayName || 'Workshop';
  const userAssignment = workshop.assignment;
  let renderEditor = true;
  try {
    JSON.parse(description);
  } catch {
    renderEditor = false;
  }
  return (
    <PageSection variant={PageSectionVariants.light} className="workshop">
      <Stack hasGutter={true}>
        <StackItem>
          <Bullseye>
            <Title headingLevel="h2">{displayName}</Title>
          </Bullseye>
        </StackItem>
        {description ? (
          <StackItem>
            <Bullseye>
              {renderEditor ? (
                <EditorViewer value={description} />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: description }} />
              )}
            </Bullseye>
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
              {userAssignment.messages ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Messages</DescriptionListTerm>
                  <DescriptionListDescription>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderContent(userAssignment.messages.replace(/\n/g, '  +\n')),
                      }}
                    />
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
              {userAssignment.data ? (
                <DescriptionListGroup>
                  <DescriptionListTerm>Data</DescriptionListTerm>
                  <DescriptionListDescription>
                    <pre>{yaml.dump(userAssignment.data)}</pre>
                  </DescriptionListDescription>
                </DescriptionListGroup>
              ) : null}
            </DescriptionList>
          </Bullseye>
        </StackItem>
      </Stack>
    </PageSection>
  );
};

export default WorkshopAccess;
