import { WorkshopSpecUserAssignment } from '@app/types';

class WorkshopLoginFailedError extends Error {}

export type WorkshopDetails = {
  accessPasswordRequired: boolean;
  assignment?: WorkshopSpecUserAssignment;
  description?: string;
  displayName?: string;
  name: string;
  namespace: string;
  template?: string;
};

export async function workshopLogin({
  accessPassword,
  email,
  workshopId,
}: {
  accessPassword?: string;
  email: string;
  workshopId: string;
}): Promise<WorkshopDetails> {
  const resp: any = await fetch(`/api/workshop/${workshopId}`, {
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
  }
  if (resp.status === 400) {
    throw new WorkshopLoginFailedError('Invalid access request.');
  } else if (resp.status === 403) {
    throw new WorkshopLoginFailedError('Invalid access password.');
  } else if (resp.status === 409) {
    throw new WorkshopLoginFailedError('No seats available for this workshop.');
  } else if (resp.status === 404) {
    throw new WorkshopLoginFailedError('Workshop no longer exists.');
  }
  throw new WorkshopLoginFailedError(`API responded with response code ${resp.status}`);
}
