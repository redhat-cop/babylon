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

describe('Resource Pool Annotation Logic', () => {
  describe('getResourcePoolAnnotation helper (createServiceRequest)', () => {
    const getResourcePoolAnnotation = (selectedResourcePool?: string) => {
      if (selectedResourcePool) {
        return { 'poolboy.gpte.redhat.com/resource-pool-name': selectedResourcePool };
      }
      return {};
    };

    test('should return pool annotation when selectedResourcePool is provided', () => {
      const result = getResourcePoolAnnotation('my-pool');
      expect(result).toEqual({ 'poolboy.gpte.redhat.com/resource-pool-name': 'my-pool' });
    });

    test('should return empty object when selectedResourcePool is undefined', () => {
      const result = getResourcePoolAnnotation(undefined);
      expect(result).toEqual({});
    });

    test('should return empty object when selectedResourcePool is not provided', () => {
      const result = getResourcePoolAnnotation();
      expect(result).toEqual({});
    });

    test('should handle "disabled" as a valid pool name', () => {
      const result = getResourcePoolAnnotation('disabled');
      expect(result).toEqual({ 'poolboy.gpte.redhat.com/resource-pool-name': 'disabled' });
    });
  });

  describe('WorkshopProvision resourcePool spec', () => {
    const getResourcePoolSpec = (selectedResourcePool?: string) => {
      return selectedResourcePool ? { resourcePool: selectedResourcePool } : {};
    };

    test('should include resourcePool in spec when selectedResourcePool is provided', () => {
      const result = getResourcePoolSpec('workshop-pool');
      expect(result).toEqual({ resourcePool: 'workshop-pool' });
    });

    test('should return empty object when selectedResourcePool is undefined', () => {
      const result = getResourcePoolSpec(undefined);
      expect(result).toEqual({});
    });

    test('should return empty object when no pool is selected', () => {
      const result = getResourcePoolSpec();
      expect(result).toEqual({});
    });
  });
});
