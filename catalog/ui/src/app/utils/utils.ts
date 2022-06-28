/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { K8sObject } from '@app/types';

export function accessibleRouteChangeHandler() {
  return window.setTimeout(() => {
    const mainContainer = document.getElementById('primary-app-container');
    if (mainContainer) {
      mainContainer.focus();
    }
  }, 50);
}

export function k8sObjectListEquals(newObjList: K8sObject[], oldObjList: K8sObject[]) {
  for (const obj of newObjList) {
    let itemEqual = false;
    oldObjList.forEach((c: any) => {
      if (c.metadata.uid === obj.metadata.uid) {
        itemEqual = c.metadata.resourceVersion === obj.metadata.resourceVersion;
      }
    });
    if (!itemEqual) {
      return false;
    }
  }
  return true;
}
