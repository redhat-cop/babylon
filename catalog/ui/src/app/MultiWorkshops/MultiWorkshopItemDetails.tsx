import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  Button,
  Card,
  CardBody,
  CardTitle,
} from '@patternfly/react-core';
import {
  patchMultiWorkshop,
  approveMultiWorkshop,
} from '@app/api';
import {
  MultiWorkshop,
} from '@app/types';
import useSession from '@app/utils/useSession';
import EditableText from '@app/components/EditableText';
import OpenshiftConsoleLink from '@app/components/OpenshiftConsoleLink';
import LocalTimestamp from '@app/components/LocalTimestamp';
import TimeInterval from '@app/components/TimeInterval';
import { ModalState } from './MultiWorkshopItem';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';

const MultiWorkshopItemDetails: React.FC<{
  onMultiWorkshopUpdate: (multiworkshop: MultiWorkshop) => void;
  multiworkshop: MultiWorkshop;
  showModal?: ({ action, multiworkshop }: ModalState) => void;
}> = ({
  onMultiWorkshopUpdate,
  multiworkshop,
}) => {
  const { isAdmin } = useSession().getSession();
  const [isApproving, setIsApproving] = useState(false);

  const isApproved = multiworkshop.metadata.annotations?.['babylon.gpte.redhat.com/approved-at'];
  const approvedBy = multiworkshop.metadata.annotations?.['babylon.gpte.redhat.com/approved-by'];
  const approvedAt = multiworkshop.metadata.annotations?.['babylon.gpte.redhat.com/approved-at'];

  async function handleApproveMultiWorkshop() {
    if (!isAdmin || isApproving) return;
    
    setIsApproving(true);
    try {
      const result = await approveMultiWorkshop({
        name: multiworkshop.metadata.name,
        namespace: multiworkshop.metadata.namespace,
      });
      onMultiWorkshopUpdate(result.multiworkshop);
    } catch (error) {
      console.error('Error approving MultiWorkshop:', error);
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <DescriptionList isHorizontal style={{rowGap: 'var(--pf-t--global--spacer--sm)',
    marginBottom: 'var(--pf-t--global--spacer--sm)'}}>
        <DescriptionListGroup>
          <DescriptionListTerm>Name</DescriptionListTerm>
          <DescriptionListDescription>
            {multiworkshop.metadata.name}
            <OpenshiftConsoleLink resource={multiworkshop} />
          </DescriptionListDescription>
        </DescriptionListGroup>
        
        <DescriptionListGroup>
          <DescriptionListTerm>Display Name</DescriptionListTerm>
          <DescriptionListDescription>
            <EditableText
              placeholder="Display name"
              value={multiworkshop.spec.displayName || multiworkshop.spec.name || ''}
              onChange={async (value: string) => {
                const updatedMultiWorkshop = await patchMultiWorkshop({
                  name: multiworkshop.metadata.name,
                  namespace: multiworkshop.metadata.namespace,
                  patch: { spec: { displayName: value } },
                });
                onMultiWorkshopUpdate(updatedMultiWorkshop);
              }}
              isLocked={!isAdmin}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Portal URL</DescriptionListTerm>
          <DescriptionListDescription>
            <Link 
              to={`/multiworkshops/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {`${window.location.origin}/multiworkshops/${multiworkshop.metadata.namespace}/${multiworkshop.metadata.name}`}
            </Link>
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Description</DescriptionListTerm>
          <DescriptionListDescription>
            <EditableText
              placeholder="Description"
              value={multiworkshop.spec.description || ''}
              onChange={async (value: string) => {
                const updatedMultiWorkshop = await patchMultiWorkshop({
                  name: multiworkshop.metadata.name,
                  namespace: multiworkshop.metadata.namespace,
                  patch: { spec: { description: value } },
                });
                onMultiWorkshopUpdate(updatedMultiWorkshop);
              }}
              isLocked={!isAdmin}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>



        <DescriptionListGroup>
          <DescriptionListTerm>Start Date</DescriptionListTerm>
          <DescriptionListDescription>
            {multiworkshop.spec.startDate ? (
              <LocalTimestamp timestamp={multiworkshop.spec.startDate} />
            ) : (
              'N/A'
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>End Date</DescriptionListTerm>
          <DescriptionListDescription>
            {multiworkshop.spec.endDate ? (
              <LocalTimestamp timestamp={multiworkshop.spec.endDate} />
            ) : (
              'N/A'
            )}
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Number of Seats</DescriptionListTerm>
          <DescriptionListDescription>
            <EditableText
              placeholder="Number of seats"
              value={multiworkshop.spec.numberSeats?.toString() || ''}
              onChange={async (value: string) => {
                const numberSeats = parseInt(value) || 0;
                const updatedMultiWorkshop = await patchMultiWorkshop({
                  name: multiworkshop.metadata.name,
                  namespace: multiworkshop.metadata.namespace,
                  patch: { spec: { numberSeats } },
                });
                onMultiWorkshopUpdate(updatedMultiWorkshop);
              }}
              isLocked={!isAdmin}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Salesforce ID</DescriptionListTerm>
          <DescriptionListDescription>
            <EditableText
              placeholder="Salesforce ID"
              value={multiworkshop.spec.salesforceId || ''}
              onChange={async (value: string) => {
                const updatedMultiWorkshop = await patchMultiWorkshop({
                  name: multiworkshop.metadata.name,
                  namespace: multiworkshop.metadata.namespace,
                  patch: { spec: { salesforceId: value } },
                });
                onMultiWorkshopUpdate(updatedMultiWorkshop);
              }}
              isLocked={!isAdmin}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Purpose</DescriptionListTerm>
          <DescriptionListDescription>
            <EditableText
              placeholder="Purpose"
              value={multiworkshop.spec.purpose || ''}
              onChange={async (value: string) => {
                const updatedMultiWorkshop = await patchMultiWorkshop({
                  name: multiworkshop.metadata.name,
                  namespace: multiworkshop.metadata.namespace,
                  patch: { spec: { purpose: value } },
                });
                onMultiWorkshopUpdate(updatedMultiWorkshop);
              }}
              isLocked={!isAdmin}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Purpose Activity</DescriptionListTerm>
          <DescriptionListDescription>
            <EditableText
              placeholder="Purpose activity"
              value={multiworkshop.spec['purpose-activity'] || ''}
              onChange={async (value: string) => {
                const updatedMultiWorkshop = await patchMultiWorkshop({
                  name: multiworkshop.metadata.name,
                  namespace: multiworkshop.metadata.namespace,
                  patch: { spec: { 'purpose-activity': value } },
                });
                onMultiWorkshopUpdate(updatedMultiWorkshop);
              }}
              isLocked={!isAdmin}
            />
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Created At</DescriptionListTerm>
          <DescriptionListDescription>
            <LocalTimestamp timestamp={multiworkshop.metadata.creationTimestamp} />
            <span style={{ padding: '0 6px' }}>
              (<TimeInterval toTimestamp={multiworkshop.metadata.creationTimestamp} />)
            </span>
          </DescriptionListDescription>
        </DescriptionListGroup>

        <DescriptionListGroup>
          <DescriptionListTerm>Created By</DescriptionListTerm>
          <DescriptionListDescription>
            {multiworkshop.metadata.annotations?.['babylon.gpte.redhat.com/created-by'] || 'N/A'}
          </DescriptionListDescription>
        </DescriptionListGroup>

        {isApproved && (
          <>
            <DescriptionListGroup>
              <DescriptionListTerm>Approved By</DescriptionListTerm>
              <DescriptionListDescription>
                {approvedBy || 'N/A'}
              </DescriptionListDescription>
            </DescriptionListGroup>

            <DescriptionListGroup>
              <DescriptionListTerm>Approved At</DescriptionListTerm>
              <DescriptionListDescription>
                {approvedAt ? (
                  <>
                    <LocalTimestamp timestamp={approvedAt} />
                    <span style={{ padding: '0 6px' }}>
                      (<TimeInterval toTimestamp={approvedAt} />)
                    </span>
                  </>
                ) : (
                  'N/A'
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
          </>
        )}
      </DescriptionList>

      {/* Assets Section */}
      <Card style={{ marginTop: '2rem' }}>
        <CardTitle>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Assets</span>
            {isAdmin && !isApproved && (
              <Button 
                variant="primary" 
                onClick={handleApproveMultiWorkshop}
                isLoading={isApproving}
                isDisabled={isApproving || !multiworkshop.spec.assets?.length}
              >
                {isApproving ? 'Approving...' : 'Approve MultiWorkshop'}
              </Button>
            )}
          </div>
        </CardTitle>
        <CardBody>
          {multiworkshop.spec.assets && multiworkshop.spec.assets.length > 0 ? (
            <Table aria-label="Assets table">
              <Thead>
                <Tr>
                  <Th>Asset Key</Th>
                  <Th>Workshop Display Name</Th>
                  <Th>Workshop Name</Th>
                  <Th>Workshop URL</Th>
                </Tr>
              </Thead>
              <Tbody>
                {multiworkshop.spec.assets.map((asset, index) => (
                  <Tr key={index}>
                    <Td>{asset.key}</Td>
                    <Td>
                      {isAdmin ? (
                        <EditableText
                          placeholder="Workshop display name"
                          value={asset.workshopDisplayName || ''}
                          onChange={async (value: string) => {
                            const updatedAssets = [...multiworkshop.spec.assets];
                            updatedAssets[index] = { ...asset, workshopDisplayName: value };
                            const updatedMultiWorkshop = await patchMultiWorkshop({
                              name: multiworkshop.metadata.name,
                              namespace: multiworkshop.metadata.namespace,
                              patch: { spec: { assets: updatedAssets } },
                            });
                            onMultiWorkshopUpdate(updatedMultiWorkshop);
                          }}
                          isLocked={false}
                        />
                      ) : (
                        asset.workshopDisplayName || 'N/A'
                      )}
                    </Td>
                    <Td>
                      {asset.workshopName ? (
                        <Link to={`/workshops/${multiworkshop.metadata.namespace}/${asset.workshopName}`}>
                          {asset.workshopName}
                        </Link>
                      ) : (
                        'Not created'
                      )}
                    </Td>
                    <Td>
                      {asset.workshopId ? (
                        <Link to={`/workshop/${asset.workshopId}`} target="_blank" rel="noopener noreferrer">
                          {window.location.protocol}
                          {'//'}
                          {window.location.host}/workshop/{asset.workshopId}
                        </Link>
                      ) : (
                        'Not available'
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <p>No assets defined for this multi-workshop.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default MultiWorkshopItemDetails;
