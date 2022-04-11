import { WorkshopSpecUserAssignment } from '@app/types';

export class WorkshopLoginFailedError extends Error {}

export interface WorkshopDetails {
  accessPasswordRequired: boolean;
  assignment?: WorkshopSpecUserAssignment;
  description?: string;
  displayName?: string;
  name: string;
  namespace: string;
}

export async function getWorkshopDetails(workshopID: string): Promise<WorkshopDetails> {
  const resp: any = await fetch(`/api/workshop/${workshopID}`);
  if (resp.status == 200) {
    return (await resp.json()) as WorkshopDetails;
  } else {
    if (resp.status != 404) {
      console.error(resp);
    }
    return null;
  }
}

export async function workshopLogin({
  accessPassword,
  email,
  workshopID,
}: {
  accessPassword?: string;
  email: string;
  workshopID: string;
}) {
  const resp: any = await fetch(`/api/workshop/${workshopID}`, {
    method: 'PUT',
    body: JSON.stringify({
      accessPassword: accessPassword,
      email: email,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (resp.status === 200) {
    return (await resp.json()) as WorkshopDetails;
  } else {
    if (resp.status === 400) {
      throw new WorkshopLoginFailedError('Invalid access request.');
    } else if (resp.status === 403) {
      throw new WorkshopLoginFailedError('Invalid access password.');
    } else if (resp.status === 409) {
      throw new WorkshopLoginFailedError('No seats available for this workshop.');
    } else if (resp.status === 404) {
      throw new WorkshopLoginFailedError('Workshop no longer exists.');
    } else {
      throw new WorkshopLoginFailedError(`API responded with response code ${resp.status}`);
    }
    return null;
  }
}
