import React from 'react';
import { Button, EmptyState, PageSection, PageSectionVariants } from '@patternfly/react-core';
import TimesIcon from '@patternfly/react-icons/dist/js/icons/times-icon';
import { CatalogItem } from '@app/types';
import useSession from '@app/utils/useSession';
import { useRect } from '@app/utils/useRect';
import LoadingIcon from '@app/components/LoadingIcon';
import CatalogGridList from './CatalogGridList';

const CatalogContent: React.FC<{
  userHasRequiredPropertiesToAccess: boolean;
  catalogItemsResult: CatalogItem[];
  onClearFilters: () => void;
  view: 'gallery' | 'list';
}> = ({ userHasRequiredPropertiesToAccess, catalogItemsResult, onClearFilters, view }) => {
  const { groups, userInterface } = useSession().getSession();
  const [wrapperRect, catalogWrapperRef] = useRect();
  return (
    <div ref={catalogWrapperRef}>
      {catalogItemsResult.length > 0 ? (
        <PageSection
          variant={PageSectionVariants.default}
          className={`catalog__content-box catalog__content-box--${view}`}
        >
          <CatalogGridList view={view} catalogItems={catalogItemsResult} wrapperRect={wrapperRect} />
        </PageSection>
      ) : (
        <PageSection variant={PageSectionVariants.default} className="catalog__content-box--empty">
          <EmptyState variant="full">
            {!userHasRequiredPropertiesToAccess && userInterface === 'rhdp-partners' ? (
              <>
                <p>Welcome to the Red Hat Demo Platform (RHDP)!</p>
                <p>At this time, it appears that your account is not listed as a pilot user for the beta version of RHDP. Please reach out to your account manager or Red Hat contact to request pilot access.</p>
                <p>Once approved, you will be able to log-in with your Red Hat credentials. We look forward to your engagement with our updated demo platform!</p>
              </>
            ) : groups.includes('salesforce-partner') && userInterface !== 'rhdp-partners' ? (
              <>
                <p>Sorry! Red Hat Demo Platform is not yet available for partners.</p>
                <p>
                  Please continue to use <a href="https://labs.opentlc.com">labs.opentlc.com</a> for labs or{' '}
                  <a href="https://demo00.opentlc.com">demo00.opentlc.com</a> for demos.
                </p>
              </>
            ) : (
              <p>
                No catalog items match filters.{' '}
                <Button
                  variant="primary"
                  aria-label="Clear all filters"
                  icon={<TimesIcon />}
                  style={{ marginLeft: 'var(--pf-global--spacer--sm)' }}
                  onClick={onClearFilters}
                >
                  Clear all filters
                </Button>
              </p>
            )}
          </EmptyState>
        </PageSection>
      )}
    </div>
  );
};

export default CatalogContent;
