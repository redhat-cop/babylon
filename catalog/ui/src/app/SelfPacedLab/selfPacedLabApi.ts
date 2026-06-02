import { WorkshopUserAssignmentSpec } from '@app/types';

class SelfPacedLabLoginFailedError extends Error {}

export type SelfPacedLabDetails = {
  accessPasswordRequired: boolean;
  assignment?: WorkshopUserAssignmentSpec;
  description?: string;
  displayName?: string;
  labUserInterfaceRedirect?: boolean;
  name: string;
  namespace: string;
  template?: string;
};

export async function selfPacedLabLogin({
  accessPassword,
  email,
  selfPacedLabId,
}: {
  accessPassword?: string;
  email: string;
  selfPacedLabId: string;
}): Promise<SelfPacedLabDetails> {
  const resp = await fetch(`/api/selfpacedlab/${selfPacedLabId}`, {
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
    return (await resp.json()) as SelfPacedLabDetails;
  }
  if (resp.status === 400) {
    throw new SelfPacedLabLoginFailedError('Invalid access request.');
  } else if (resp.status === 403) {
    throw new SelfPacedLabLoginFailedError('Invalid access password.');
  } else if (resp.status === 409) {
    throw new SelfPacedLabLoginFailedError('No seats available for this lab.');
  } else if (resp.status === 404) {
    throw new SelfPacedLabLoginFailedError('Self-paced lab no longer exists.');
  }
  throw new SelfPacedLabLoginFailedError(`API responded with response code ${resp.status}`);
}
