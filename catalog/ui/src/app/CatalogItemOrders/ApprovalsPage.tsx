import React from 'react';
import { useParams } from 'react-router-dom';
import useSession from '@app/utils/useSession';
import Footer from '@app/components/Footer';
import NotFound from '@app/components/NotFound';
import ApprovalsList from './ApprovalsList';
import type { ApprovalsScope } from './ApprovalsList';
import ApprovalReview from './ApprovalReview';

/** /approvals[/:orderUid] for managers and /admin/approvals[/:orderUid] for administrators. */
export const ApprovalsPage: React.FC<{ scope: ApprovalsScope }> = ({ scope }) => {
  const { orderUid } = useParams();
  const { catalogItemOrdersEnabled } = useSession().getSession();
  if (!catalogItemOrdersEnabled) return <NotFound name="Approvals" type="Page" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', flexGrow: 1 }}>
      {orderUid ? <ApprovalReview uid={orderUid} scope={scope} /> : <ApprovalsList scope={scope} />}
      <Footer />
    </div>
  );
};

const ManagerApprovals: React.FC = () => <ApprovalsPage scope="manager" />;

export default ManagerApprovals;
