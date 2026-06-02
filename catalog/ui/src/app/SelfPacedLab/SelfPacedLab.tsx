import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useSWRImmutable from 'swr/immutable';
import Footer from '@app/components/Footer';
import summitLogo from '@app/bgimages/Summit-Logo.svg';
import { publicFetcher } from '@app/api';
import useDocumentTitle from '@app/utils/useDocumentTitle';
import { apiPaths } from './selfpacedlab-utils';
import { selfPacedLabLogin, SelfPacedLabDetails } from './selfPacedLabApi';
import SelfPacedLabContent from './SelfPacedLabContent';
import WorkshopHeader from '@app/Workshop/WorkshopHeader';
import SelfPacedLabLogin from './SelfPacedLabLogin';

import '@app/Workshop/workshop.css';

const SelfPacedLab: React.FC<{ title: string }> = ({ title }) => {
  useDocumentTitle(title);
  const { selfPacedLabId } = useParams();
  const [searchParams] = useSearchParams();
  const userInterface = searchParams.get('userInterface') || 'rhpds';
  const [loginFailureMessage, setLoginFailureMessage] = useState('');
  const { data: selfPacedLab } = useSWRImmutable<SelfPacedLabDetails>(
    selfPacedLabId ? apiPaths.SELF_PACED_LAB({ selfPacedLabId }) : null,
    publicFetcher,
  );
  const [selfPacedLabPrivateInfo, setSelfPacedLabPrivateInfo] = useState(selfPacedLab);

  async function attemptLogin(email: string, accessPassword: string) {
    try {
      const info = await selfPacedLabLogin({
        accessPassword,
        email,
        selfPacedLabId,
      });
      setSelfPacedLabPrivateInfo(info);
      setLoginFailureMessage('');
    } catch (error: unknown) {
      if (error instanceof Error) {
        setLoginFailureMessage(error.message);
      } else {
        setLoginFailureMessage('UNKNOWN ERROR');
      }
    }
  }

  return (
    <div className="workshop">
      <WorkshopHeader userInterface={userInterface} />
      <main className="workshop__main">
        {selfPacedLabPrivateInfo?.assignment ? (
          <SelfPacedLabContent selfPacedLab={selfPacedLabPrivateInfo} />
        ) : (
          <SelfPacedLabLogin
            loginFailureMessage={loginFailureMessage}
            onLogin={(email, accessPassword) => attemptLogin(email, accessPassword)}
            selfPacedLab={selfPacedLab}
          />
        )}
      </main>
      <Footer
        rightElement={
          userInterface === 'summit' ? (
            <a href="https://www.redhat.com/summit">
              <img src={summitLogo} alt="Red Hat Summit" width="72px" />
            </a>
          ) : null
        }
      />
    </div>
  );
};

export default SelfPacedLab;
