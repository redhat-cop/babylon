import React from 'react';
import { ResourceClaim, ServiceActionActions } from '@app/types';
import { displayName } from '@app/util';
import StarRating from '@app/components/StarRating';
import { Form, FormGroup, TextArea } from '@patternfly/react-core';
import { apiPaths, fetcher } from '@app/api';
import useSWRImmutable from 'swr/immutable';

const ServicesActionRating: React.FC<{
  setActionState?: React.Dispatch<
    React.SetStateAction<{
      action: ServiceActionActions;
      resourceClaim?: ResourceClaim;
      rating?: { rate: number; comment: string };
    }>
  >;
  actionState: {
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    rating?: { rate: number; comment: string };
  };
  hasError?: boolean;
}> = ({ actionState, setActionState, hasError = false }) => {
  const resourceClaim = actionState.resourceClaim;
  const provisionUuid = resourceClaim.status?.resources
    .map((r) => r.state?.spec?.vars?.job_vars?.uuid)
    .find((uuid) => uuid);

  const { data: existingRating } = useSWRImmutable<{ rating: number; comment: string }>(
    !hasError && provisionUuid ? apiPaths.PROVISION_RATING({ provisionUuid }) : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  return (
    <>
      {provisionUuid ? (
        <Form className="services-action__rating-form">
          <FormGroup fieldId="comment" label="Rating">
            <StarRating
              count={5}
              rating={actionState.rating ? actionState.rating.rate || 0 : existingRating?.rating || 0}
              onRating={(rate) =>
                setActionState({
                  ...actionState,
                  rating: { comment: existingRating?.comment, ...actionState.rating, rate },
                })
              }
            />
          </FormGroup>
          <FormGroup
            fieldId="comment"
            label={
              <span>
                Add feedback for <i>{displayName(resourceClaim)}</i> developers
              </span>
            }
          >
            <TextArea
              id="comment"
              onChange={(comment) =>
                setActionState({
                  ...actionState,
                  rating: { rate: existingRating?.rating, ...actionState.rating, comment },
                })
              }
              value={actionState.rating ? actionState.rating.comment || '' : existingRating?.comment || ''}
              placeholder="Add comment"
              aria-label="Add comment"
            />
          </FormGroup>
        </Form>
      ) : (
        <div>
          <p>Not available</p>
        </div>
      )}
    </>
  );
};

export default ServicesActionRating;
