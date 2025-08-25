import React from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  Spinner,
  Alert,
} from '@patternfly/react-core';

import { apiPaths, fetcher } from '@app/api';
import { MultiWorkshop } from '@app/types';
import { compareK8sObjects } from '@app/util';
import heroImg from './hero-img.jpeg';
import LabIcon from './LabIcon';

import './multiworkshop-landing.css';

interface WorkshopCardProps {
  asset: {
    key: string;
    displayName?: string;
    description?: string;
    workshopId?: string;
    name?: string;
    url?: string;
    type?: 'Workshop' | 'external';
  };
  isAvailable: boolean;
}

const WorkshopCard: React.FC<WorkshopCardProps> = ({ asset, isAvailable }) => {
  const displayName = asset.displayName || asset.key;
  
  // Determine the URL based on asset type
  const workshopUrl = asset.type === 'external' 
    ? asset.url 
    : asset.workshopId 
      ? `/workshop/${asset.workshopId}` 
      : null;

  if (!isAvailable) {
    return (
      <div className="demo-card demo-card--unavailable">
        <div className="demo-card__header">
          <LabIcon 
            alt={displayName}
            width={60}
            height={60}
          />
          <div className="demo-card__badges"></div>
        </div>
        <div className="demo-card__body">
          <h3 className="demo-card__title">{displayName}</h3>
          {asset.description && (
            <p className="demo-card__description">{asset.description}</p>
          )}
          <p className="demo-card__subtitle demo-card__subtitle--disabled">
            {asset.type === 'external' ? 'External workshop unavailable' : 'Workshop unavailable'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <a 
      className="demo-card"
      href={workshopUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!workshopUrl) {
          e.preventDefault();
        }
      }}
    >
      <div className="demo-card__header">
        <LabIcon 
          alt={displayName}
          width={60}
          height={60}
        />
        <div className="demo-card__badges"></div>
      </div>
      <div className="demo-card__body">
        <h3 className="demo-card__title">{displayName}</h3>
        {asset.description && (
          <p className="demo-card__description">{asset.description}</p>
        )}
        <p className="demo-card__subtitle">
          Access this lab{' '}
          <svg 
            className="pfe-cta--arrow" 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 31.56 31.56" 
            focusable="false" 
            width="1em"
          >
            <path d="M15.78 0l-3.1 3.1 10.5 10.49H0v4.38h23.18l-10.5 10.49 3.1 3.1 15.78-15.78L15.78 0z"></path>
          </svg>
        </p>
      </div>
    </a>
  );
};

const MultiWorkshopLandingComponent: React.FC<{
  namespace: string;
  multiworkshopName: string;
}> = ({ namespace, multiworkshopName }) => {
  const {
    data: multiworkshop,
    error,
    isLoading
  } = useSWR<MultiWorkshop>(
    apiPaths.PUBLIC_MULTIWORKSHOP({
      namespace: namespace,
      multiworkshopName: multiworkshopName,
    }),
    fetcher,
    {
      refreshInterval: 10000,
      compare: compareK8sObjects,
    }
  );

  if (isLoading) {
    return (
      <div className="multi-workshop-landing">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error || !multiworkshop) {
    return (
      <div className="multi-workshop-landing">
        <div className="container" style={{ padding: '24px' }}>
          <Alert variant="danger" title="Workshop Not Found">
            The requested multi-workshop could not be found or you don't have access to it.
          </Alert>
        </div>
      </div>
    );
  }

  const displayName = multiworkshop.spec.displayName || multiworkshop.spec.name || multiworkshop.metadata.name;
  const assets = multiworkshop.spec.assets || [];

  return (
    <div className="multi-workshop-landing" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="header-container" style={{ flexShrink: 0 }}>
        <header className="dms-band header bg-gray-900 d-flex align-items-center position-fixed top-0 w-100 z-1 py-0" style={{ height: '80px' }}>
          <div className="container">
            <div className="navbar navbar-expand-lg p-0 d-flex justify-content-between w-100" role="navigation">
              {/* Left side - Red Hat Demo Platform Logo */}
              <div className="navbar-brand">
                <a href="https://demo.redhat.com" title="Red Hat Demo Platform">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1508.5 178.739" style={{ width: '278px' }}>
                    <g fill="#fff">
                      <path d="M316.6 63.2v-56H342a21.279 21.279 0 0 1 7.8 1.3 18.111 18.111 0 0 1 5.9 3.5 15.577 15.577 0 0 1 5 11.8 15.051 15.051 0 0 1-3.1 9.5 16.836 16.836 0 0 1-8.4 5.8l12.5 24.1h-9.3l-11.6-23H325v23Zm24.7-48.6H325v18.7h16.3q5.25 0 8.1-2.7a8.7 8.7 0 0 0 2.8-6.6 8.7 8.7 0 0 0-2.8-6.6c-1.8-1.9-4.5-2.8-8.1-2.8ZM364.1 42.8a20.674 20.674 0 0 1 1.6-8.2 20.288 20.288 0 0 1 4.3-6.7 19.92 19.92 0 0 1 6.5-4.5 19.718 19.718 0 0 1 8-1.6 18.463 18.463 0 0 1 7.8 1.6 18.677 18.677 0 0 1 6.2 4.5 20.927 20.927 0 0 1 4.1 6.8 23.2 23.2 0 0 1 1.5 8.4v2.3H372a13.822 13.822 0 0 0 4.6 8.4 13.6 13.6 0 0 0 9.1 3.3 15.553 15.553 0 0 0 5.7-1 12.858 12.858 0 0 0 4.6-2.6l5.1 5a25.983 25.983 0 0 1-7.4 4.1 24.69 24.69 0 0 1-8.4 1.3 21.306 21.306 0 0 1-8.4-1.6 22.763 22.763 0 0 1-6.8-4.4 20.788 20.788 0 0 1-4.5-6.7 23.2 23.2 0 0 1-1.5-8.4Zm20.2-14.2a11.527 11.527 0 0 0-8 3 13.046 13.046 0 0 0-4.2 7.8h24.2a13.091 13.091 0 0 0-4.2-7.8 11.106 11.106 0 0 0-7.8-3ZM443.1 63.2v-3.8a19.448 19.448 0 0 1-5.8 3.3 18.924 18.924 0 0 1-6.7 1.2 19.824 19.824 0 0 1-14.6-6.1 22.268 22.268 0 0 1-4.4-6.7 21.812 21.812 0 0 1 0-16.4A20.534 20.534 0 0 1 416 28a19.335 19.335 0 0 1 6.6-4.5 20.334 20.334 0 0 1 8.2-1.6 20.7 20.7 0 0 1 6.6 1 19.415 19.415 0 0 1 5.7 3V7.2l8-1.8v57.8Zm-25.2-20.4a13.718 13.718 0 0 0 4 10.1 13.45 13.45 0 0 0 9.8 4.1 14.956 14.956 0 0 0 6.4-1.3 15.954 15.954 0 0 0 4.9-3.6V33.6a14.988 14.988 0 0 0-4.9-3.5 15.271 15.271 0 0 0-6.4-1.3 13.423 13.423 0 0 0-9.9 4 13.806 13.806 0 0 0-3.9 10ZM478.1 63.2v-56h8.4v24h29.8v-24h8.4v56h-8.4V38.8h-29.8v24.4ZM547.2 64a16.483 16.483 0 0 1-10.8-3.5 11.037 11.037 0 0 1-4.2-8.9 10.375 10.375 0 0 1 4.7-9.2 20.76 20.76 0 0 1 11.8-3.2 27.841 27.841 0 0 1 5.8.6 27.374 27.374 0 0 1 5.3 1.6v-4.3a8.143 8.143 0 0 0-2.6-6.5 11.452 11.452 0 0 0-7.4-2.2 20.788 20.788 0 0 0-6 .9 34.616 34.616 0 0 0-6.6 2.6l-3-6a54.169 54.169 0 0 1 8.4-3.1 33.18 33.18 0 0 1 8.3-1.1c5.2 0 9.3 1.3 12.2 3.8s4.4 6.1 4.4 10.8v27h-7.8v-3.5a19.441 19.441 0 0 1-5.8 3.2 23.54 23.54 0 0 1-6.7 1Zm-7.3-12.6a5.646 5.646 0 0 0 2.6 4.8 11.193 11.193 0 0 0 6.6 1.8 16.256 16.256 0 0 0 5.9-1 14.449 14.449 0 0 0 4.9-2.9V47a19.778 19.778 0 0 0-4.8-1.8 24.933 24.933 0 0 0-5.7-.6 11.859 11.859 0 0 0-6.8 1.8 5.728 5.728 0 0 0-2.7 5ZM580.6 53.2v-24H572v-6.7h8.6V12.1l7.9-1.9v12.3h12v6.7h-12v22.1a5.94 5.94 0 0 0 1.4 4.4c.9.9 2.5 1.3 4.6 1.3a23.637 23.637 0 0 0 3-.2 10.857 10.857 0 0 0 2.8-.8v6.7a19.28 19.28 0 0 1-3.8.9 27.484 27.484 0 0 1-3.8.3c-3.9 0-7-.9-9-2.8-2-1.7-3.1-4.4-3.1-7.9Z"></path>
                    </g>
                    <path d="M127 90.2c12.5 0 30.6-2.6 30.6-17.5a12.678 12.678 0 0 0-.3-3.4L149.8 37c-1.7-7.1-3.2-10.3-15.7-16.6-9.7-5-30.8-13.1-37.1-13.1-5.8 0-7.5 7.5-14.4 7.5-6.7 0-11.6-5.6-17.9-5.6-6 0-9.9 4.1-12.9 12.5 0 0-8.4 23.7-9.5 27.2a4.216 4.216 0 0 0-.3 1.9c0 9.2 36.3 39.4 85 39.4Zm32.5-11.4c1.7 8.2 1.7 9.1 1.7 10.1 0 14-15.7 21.8-36.4 21.8-46.8 0-87.7-27.4-87.7-45.5a17.535 17.535 0 0 1 1.5-7.3C21.8 58.8 0 61.8 0 81c0 31.5 74.6 70.3 133.7 70.3 45.3 0 56.7-20.5 56.7-36.6-.1-12.8-11-27.3-30.9-35.9Z" fill="#e00"></path>
                    <path d="M159.5 78.8c1.7 8.2 1.7 9.1 1.7 10.1 0 14-15.7 21.8-36.4 21.8-46.8 0-87.7-27.4-87.7-45.5a17.535 17.535 0 0 1 1.5-7.3l3.7-9.1a4.877 4.877 0 0 0-.3 2c0 9.2 36.3 39.4 85 39.4 12.5 0 30.6-2.6 30.6-17.5a12.678 12.678 0 0 0-.3-3.4Z"></path>
                    <path d="M253.5 158.7a2.22 2.22 0 0 1-2.2-2.2V2.2a2.2 2.2 0 0 1 4.4 0v154.2a2.242 2.242 0 0 1-2.2 2.3Z" fill="#fff"></path>
                    <text data-name="Demo Platform" transform="translate(1186 149)" fill="#fff" fontSize="82" fontFamily="'Red Hat Display', 'Overpass', overpass, helvetica, arial, sans-serif" fontWeight="700">
                      <tspan x="-877.892" y="0">Demo Platform</tspan>
                    </text>
                  </svg>
                </a>
              </div>
              
              {/* Right side - MultiWorkshop Logo */}
              {multiworkshop.spec.logoImage && (
                <div className="navbar-logo-right d-flex align-items-center">
                  <img 
                    style={{ maxWidth: '200px', maxHeight: '60px', objectFit: 'contain' }} 
                    src={multiworkshop.spec.logoImage} 
                    alt={`${displayName} Logo`}
                    title={displayName}
                  />
                </div>
              )}
            </div>
          </div>
        </header>
      </div>

      {/* Content */}
      <div className="content-container" style={{ marginTop: '80px', display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
        {/* Hero Banner */}
        <div style={{ flexShrink: 0 }}>
          <img 
            className="img-fluid d-md-block d-none" 
            src={multiworkshop.spec.backgroundImage || heroImg} 
            alt={`${displayName} - Red Hat Demo Platform`}
            style={{ width: '100%', height: 'auto', maxHeight: '250px', objectFit: 'cover' }}
          />
        </div>

        {/* Main Content */}
        <section className="dms-band py-0 mt-n1 flex-grow-1 d-flex flex-column" style={{ overflow: 'auto' }}>
          <div className="py-3 bg-gray-200 d-flex flex-column align-items-center flex-grow-1">
            <div className="row mb-3">
              <div className="col-12 p-2 text-sm-center" style={{ maxWidth: '650px' }}>
                <h3 className="px-1 my-1">{displayName}</h3>
                {multiworkshop.spec.description && (
                  <p className="px-1">{multiworkshop.spec.description}</p>
                )}
              </div>
            </div>

            {/* Workshop Cards */}
            <div className="assets-container flex-grow-1 d-flex flex-column justify-content-center w-100">
              {assets.length === 0 ? (
                <div style={{ marginTop: '24px' }}>
                  <Alert variant="info" title="No Workshop Sessions">
                    This multi-workshop doesn't have any workshop sessions configured yet.
                  </Alert>
                </div>
              ) : (
                <div className="demo-card-grid">
                  {assets.map((asset, index) => {
                    // External workshops are available if they have a URL
                    // Catalog workshops are available if they have a workshopId
                    const isAvailable = asset.type === 'external' 
                      ? !!asset.url 
                      : !!asset.workshopId;
                    
                    return (
                      <WorkshopCard
                        key={asset.key || index}
                        asset={asset}
                        isAvailable={isAvailable}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const MultiWorkshopLanding: React.FC = () => {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();

  if (!namespace || !name) {
    return (
      <div className="multi-workshop-landing">
        <div className="container" style={{ padding: '24px' }}>
          <Alert variant="danger" title="Invalid URL">
            The workshop URL is not valid. Please check the link and try again.
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <MultiWorkshopLandingComponent
      namespace={namespace}
      multiworkshopName={name}
    />
  );
};

export default MultiWorkshopLanding;
