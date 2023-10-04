import React from 'react';
import { ResourceClaim, ServiceActionActions } from '@app/types';
import StarRating from '@app/components/StarRating';
import { Form, FormGroup, Radio, TextArea } from '@patternfly/react-core';
import { apiPaths, fetcher } from '@app/api';
import useSWRImmutable from 'swr/immutable';

const ServicesActionRating: React.FC<{
  setActionState: React.Dispatch<
    React.SetStateAction<{
      action: ServiceActionActions;
      resourceClaim?: ResourceClaim;
      rating?: { rate: number; useful: 'yes' | 'no' | 'not applicable'; comment: string };
      submitDisabled: boolean;
    }>
  >;
  actionState: {
    action: ServiceActionActions;
    resourceClaim?: ResourceClaim;
    rating?: { rate: number; useful: 'yes' | 'no' | 'not applicable'; comment: string };
    submitDisabled: boolean;
  };
  hasError?: boolean;
  action: 'rate' | 'delete';
}> = ({ actionState, setActionState, hasError = false, action }) => {
  const resourceClaim = actionState.resourceClaim;
  const provisionUuid = resourceClaim.status?.resources
    .map((r) => r.state?.spec?.vars?.job_vars?.uuid)
    .find((uuid) => uuid);

  const { data: existingRating } = useSWRImmutable<{
    rating: number;
    useful: 'yes' | 'no' | 'not applicable';
    comment: string;
  }>(!hasError && provisionUuid ? apiPaths.PROVISION_RATING({ provisionUuid }) : null, fetcher, {
    shouldRetryOnError: false,
  });

  return (
    <>
      {provisionUuid ? (
        <Form className="services-action__rating-form">
          <FormGroup
            fieldId="useful"
            label="Do you believe this asset helped you progress in the sales cycle with your customer?"
          >
            <Radio
              isChecked={actionState.rating ? actionState.rating.useful === 'yes' : existingRating?.useful === 'yes'}
              name="radio-1"
              onChange={() =>
                setActionState({
                  ...actionState,
                  rating: { ...actionState.rating, useful: 'yes' },
                })
              }
              label="Yes"
              id="radio-useful-yes"
            ></Radio>
            <Radio
              isChecked={actionState.rating ? actionState.rating.useful === 'no' : existingRating?.useful === 'no'}
              name="radio-2"
              onChange={() =>
                setActionState({
                  ...actionState,
                  rating: { ...actionState.rating, useful: 'no' },
                })
              }
              label="No"
              id="radio-useful-no"
            ></Radio>
            <Radio
              isChecked={
                actionState.rating
                  ? actionState.rating.useful === 'not applicable'
                  : existingRating?.useful === 'not applicable'
              }
              name="radio-3"
              onChange={() =>
                setActionState({
                  ...actionState,
                  rating: { ...actionState.rating, useful: 'not applicable' },
                })
              }
              label="Not Applicable"
              id="radio-useful-not-applicable"
            ></Radio>
          </FormGroup>
          <FormGroup
            fieldId="rating"
            label="How would you rate the quality of the supporting materials for this asset?"
          >
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
            label={<span>Additional information</span>}
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
