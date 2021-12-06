import React from "react";
import { useSelector } from 'react-redux';
import { selectConsoleURL } from '@app/store';
import { K8sResourceObject, K8sResourceReference } from '@app/api';

import openshiftIconSVG from '@app/bgimages/openshift-icon.svg';
import './openshift-console-link.css';

export interface OpenshiftConsoleLinkProps {
  linkToNamespace?: boolean;
  reference?: K8sResourceReference;
  resource?: K8sResourceObject;
}

const OpenshiftConsoleLink: React.FunctionComponent<OpenshiftConsoleLinkProps> = ({
  children,
  linkToNamespace,
  reference,
  resource,
}) => {
  const consoleURL = useSelector(selectConsoleURL);
  const apiVersion = (reference?.apiVersion || resource?.apiVersion)
  const kind = (reference?.kind || resource?.kind)
  const plural = kind.toLowerCase() + 's';
  const name = (reference?.name || resource?.metadata?.name)
  const namespace = (reference?.namespace || resource?.metadata?.namespace)

  const linkHref = apiVersion.includes('/') ? (
    linkToNamespace ? `${consoleURL}/api-resource/ns/${namespace}/${apiVersion.replace('/', '~')}~${kind}/instances` : `${consoleURL}/k8s/ns/${namespace}/${apiVersion.replace('/', '~')}~${kind}/${name}`
  ) : (
    linkToNamespace ? `${consoleURL}/k8s/ns/${namespace}/${plural}` : `${consoleURL}/k8s/ns/${namespace}/${plural}/${name}`
  );

  return (
    <a className="openshift-console-link"
      href={linkHref}
      target="_blank"
      title={linkToNamespace ? `Manage ${kind}s in OpenShift Console` : `Manage ${kind} in OpenShift Console`}
    >
      {children}
      <img alt="OpenShift" src={openshiftIconSVG}/>
    </a>
  );
}

export default OpenshiftConsoleLink;
