import fetchMock from 'jest-fetch-mock';
import { selfPacedLabLogin } from './selfPacedLabApi';

describe('selfPacedLabLogin', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  const selfPacedLabId = 'test-lab-id';
  const email = 'user@example.com';
  const accessPassword = 'secret123';

  const mockSuccessResponse = {
    accessPasswordRequired: true,
    assignment: {
      selfPacedLabName: 'test-lab',
      resourceClaimName: 'rc-001',
      assignment: { email: 'user@example.com' },
      labUserInterface: { url: 'https://lab.example.com', redirect: true },
      messages: 'Welcome to the lab',
      data: { some_key: 'some_value' },
    },
    description: 'A test lab',
    displayName: 'Test Lab',
    labUserInterfaceRedirect: true,
    name: 'test-lab',
    namespace: 'test-ns',
    template: 'some-template',
  };

  test('should send PUT request with email and accessPassword', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(mockSuccessResponse), { status: 200 });

    await selfPacedLabLogin({ accessPassword, email, selfPacedLabId });

    expect(fetchMock).toHaveBeenCalledWith(`/api/selfpacedlab/${selfPacedLabId}`, {
      method: 'PUT',
      body: JSON.stringify({ accessPassword, email }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  test('should return SelfPacedLabDetails on 200 response', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(mockSuccessResponse), { status: 200 });

    const result = await selfPacedLabLogin({ email, selfPacedLabId });

    expect(result).toEqual(mockSuccessResponse);
    expect(result.assignment?.selfPacedLabName).toBe('test-lab');
    expect(result.assignment?.assignment?.email).toBe('user@example.com');
    expect(result.assignment?.labUserInterface?.url).toBe('https://lab.example.com');
  });

  test('should throw on 400 (invalid request)', async () => {
    fetchMock.mockResponseOnce('', { status: 400 });

    await expect(selfPacedLabLogin({ email, selfPacedLabId })).rejects.toThrow('Invalid access request.');
  });

  test('should throw on 403 (invalid password)', async () => {
    fetchMock.mockResponseOnce('', { status: 403 });

    await expect(selfPacedLabLogin({ accessPassword: 'wrong', email, selfPacedLabId })).rejects.toThrow(
      'Invalid access password.',
    );
  });

  test('should throw on 409 (no seats available)', async () => {
    fetchMock.mockResponseOnce('', { status: 409 });

    await expect(selfPacedLabLogin({ email, selfPacedLabId })).rejects.toThrow(
      'No seats available for this lab.',
    );
  });

  test('should throw on 404 (lab not found)', async () => {
    fetchMock.mockResponseOnce('', { status: 404 });

    await expect(selfPacedLabLogin({ email, selfPacedLabId })).rejects.toThrow(
      'Self-paced lab no longer exists.',
    );
  });

  test('should throw with status code on unexpected error', async () => {
    fetchMock.mockResponseOnce('', { status: 500 });

    await expect(selfPacedLabLogin({ email, selfPacedLabId })).rejects.toThrow(
      'API responded with response code 500',
    );
  });

  test('should send undefined accessPassword when not provided', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(mockSuccessResponse), { status: 200 });

    await selfPacedLabLogin({ email, selfPacedLabId });

    expect(fetchMock).toHaveBeenCalledWith(`/api/selfpacedlab/${selfPacedLabId}`, {
      method: 'PUT',
      body: JSON.stringify({ accessPassword: undefined, email }),
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
