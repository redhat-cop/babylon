import React, { useMemo } from 'react';
import {
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
} from '@patternfly/react-core';
import { renderContent, BABYLON_DOMAIN } from '@app/util';
import { ResourceClaim } from '@app/types';

const UserMessage: React.FC<{
  userName: string;
  userMessages: string;
  userLabUrl: string;
  userDataEntries: [string, unknown][];
}> = ({ userName, userMessages, userLabUrl, userDataEntries }) => {
  const userMessagesHtml = useMemo(
    () => (
      <div
        dangerouslySetInnerHTML={{
          __html: renderContent(userMessages, {
            format: 'htmlString',
          }),
        }}
      />
    ),
    [userMessages]
  );

  return (
    <React.Fragment key={userName}>
      <h2>{userName}</h2>
      <DescriptionList isHorizontal>
        {userLabUrl ? (
          <DescriptionListGroup>
            <DescriptionListTerm>Lab URL</DescriptionListTerm>
            <DescriptionListDescription>
              <a href={userLabUrl}>{userLabUrl}</a>
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
        {userMessages ? (
          <DescriptionListGroup>
            <DescriptionListTerm>User Messages</DescriptionListTerm>
            <DescriptionListDescription>{userMessagesHtml}</DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
        {userDataEntries ? (
          <DescriptionListGroup>
            <DescriptionListTerm>User Data</DescriptionListTerm>
            <DescriptionListDescription>
              <DescriptionList isHorizontal className="service-users__user-data">
                {userDataEntries.map(([key, value]) => (
                  <DescriptionListGroup key={key}>
                    <DescriptionListTerm>{key}</DescriptionListTerm>
                    <DescriptionListDescription>
                      {typeof value === 'string' ? (
                        value.startsWith('https://') ? (
                          <a href={value}>
                            <code>{value}</code>
                          </a>
                        ) : (
                          <code>{value}</code>
                        )
                      ) : (
                        <code>{JSON.stringify(value)}</code>
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
              </DescriptionList>
            </DescriptionListDescription>
          </DescriptionListGroup>
        ) : null}
      </DescriptionList>
    </React.Fragment>
  );
};

const ServiceUsers: React.FC<{
  resourceClaim: ResourceClaim;
}> = ({ resourceClaim }) => {
  const users = {};
  const labUserInterfaceUrls = JSON.parse(
    resourceClaim.metadata.annotations?.[`${BABYLON_DOMAIN}/labUserInterfaceUrls`] || '{}'
  );

  for (const status_resource of resourceClaim?.status?.resources || []) {
    const resource_users = status_resource.state?.spec?.vars?.provision_data?.users;
    if (resource_users) {
      Object.assign(users, resource_users);
    }
  }

  return (
    <>
      {Object.entries(users).map(([userName, userData]: any) => {
        const userLabUrl =
          labUserInterfaceUrls[userName] || userData.labUserInterfaceUrl || userData.lab_ui_url || userData.bookbag_url;
        const userDataEntries = Object.entries(userData).filter(
          ([key]) => key !== 'bookbag_url' && key !== 'lab_ui_url' && key !== 'labUserInterfaceUrl' && key !== 'msg'
        );
        const userMessages: string = userData.msg;
        <UserMessage
          userMessages={userMessages}
          userDataEntries={userDataEntries}
          userLabUrl={userLabUrl}
          userName={userName}
        />;
      })}
    </>
  );
};

export default ServiceUsers;
