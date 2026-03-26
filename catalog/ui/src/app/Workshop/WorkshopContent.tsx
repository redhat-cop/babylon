import React, { useMemo } from 'react';
import yaml from 'js-yaml';
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
      <div style={{ padding: "var(--pf-t--global--spacer--md)" }}>
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
    <div className="workshop-content">
      <Hero image={heroImg} overlay compact>
        <h1 className="workshop-content__hero-title">{displayName}</h1>
      </Hero>
      <section className="workshop-content__body">
        <div className="workshop-content__wrapper">
          <h2 className="workshop-content__section-title">
            Instructions for {displayName}
          </h2>

          {description ? (
            <div className="workshop-content__card">
              {renderEditor ? (
                <EditorViewer value={description} />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: renderContent(description, { format: 'html' }) }} />
              )}
            </div>
          ) : null}

          {userAssignment.labUserInterface ? (
            <div className="workshop-content__card">
              <h3 className="workshop-content__card-label">Lab User Interface</h3>
              <a
                href={userAssignment.labUserInterface.url}
                target="_blank"
                rel="noreferrer"
                className="workshop-content__link"
              >
                {userAssignment.labUserInterface.url} <ExternalLinkAltIcon />
              </a>
            </div>
          ) : null}

          {templateHtml ? (
            <div className="workshop-content__card">
              {templateHtml}
            </div>
          ) : (
            <>
              {userAssignment.messages ? (
                <div className="workshop-content__card">
                  <h3 className="workshop-content__card-label">Messages</h3>
                  {userAssignmentMessagesHtml}
                </div>
              ) : null}
              {userAssignment.data ? (
                <div className="workshop-content__card">
                  <h3 className="workshop-content__card-label">Data</h3>
                  <pre className="workshop-content__pre">
                    {yaml.dump(
                      Object.keys(userAssignment.data).length === 1
                        ? userAssignment.data[Object.keys(userAssignment.data)[0]]
                        : userAssignment.data,
                    )}
                  </pre>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default WorkshopContent;
