import { FORBIDDEN_RESPONSE } from './api';

// Mock the fetcher and apiFetch
jest.mock('./api', () => {
  const originalModule = jest.requireActual('./api');
  return {
    ...originalModule,
    fetcher: jest.fn(),
  };
});

describe('optionalFetcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('FORBIDDEN_RESPONSE should be an object with forbidden: true', () => {
    expect(FORBIDDEN_RESPONSE).toEqual({ forbidden: true });
  });
});

describe('FORBIDDEN_RESPONSE constant', () => {
  test('should have forbidden property set to true', () => {
    expect(FORBIDDEN_RESPONSE.forbidden).toBe(true);
  });

  test('should be usable for strict equality comparison', () => {
    const response = FORBIDDEN_RESPONSE;
    expect(response === FORBIDDEN_RESPONSE).toBe(true);
  });
});
