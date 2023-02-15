import React from 'react';
import { ResourceClaim, ServiceActionActions } from '@app/types';
import { displayName } from '@app/util';
import StarRating from '@app/components/StarRating';
import { Form, FormGroup, TextArea } from '@patternfly/react-core';
import { apiPaths, fetcher } from '@app/api';
import useSWRImmutable from 'swr/immutable';

const ServicesActionRating: React.FC<{
  setActionState: React.Dispatch<
    React.SetStateAction<{
      action: ServiceActionActions;
      resourceClaim?: ResourceClaim;
      rating?: { rate: number; comment: string };
      submitDisabled: boolean;
    }>
  >;
  actionState: {
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    rating?: { rate: number; comment: string };
    submitDisabled: boolean;
  };
  hasError?: boolean;
  action: 'rate' | 'delete';
}> = ({ actionState, setActionState, hasError = false, action }) => {
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
              onRating={(rate) => {
                const rating = { comment: existingRating?.comment, ...actionState.rating, rate };
                setActionState({
                  ...actionState,
                  rating,
                  submitDisabled: rate < 3 && (!rating.comment || rating.comment.trim() === ''),
                });
              }}
            />
          </FormGroup>
          <FormGroup
            fieldId="comment"
            label={
              <span>
                Add feedback for <i>{displayName(resourceClaim)}</i> developers
              </span>
            }
            isRequired={actionState.submitDisabled}
          >
            <TextArea
              id="comment"
              onChange={(comment) => {
                const rating = { rate: existingRating?.rating, ...actionState.rating, comment };
                setActionState({
                  ...actionState,
                  rating,
                  submitDisabled:
                    Number.isFinite(rating.rate) && rating.rate < 3 ? !comment || comment.trim() === '' : false,
                });
              }}
              value={actionState.rating ? actionState.rating.comment || '' : existingRating?.comment || ''}
              placeholder="Add comment"
              aria-label="Add comment"
              isRequired={actionState.submitDisabled}
            />
          </FormGroup>
        </Form>
      ) : action === 'rate' ? (
        <div>
          <p>Not available</p>
        </div>
      ) : null}
    </>
  );
};

export default ServicesActionRating;
