import { reduceFormState, checkCondition, checkEnableSubmit } from './CatalogItemFormReducer';
import { CatalogItem, ServiceNamespace, TPurposeOpts } from '@app/types';

const mockCatalogItem: CatalogItem = {
  apiVersion: 'babylon.gpte.redhat.com/v1',
  kind: 'CatalogItem',
  metadata: {
    name: 'test-catalog-item',
    namespace: 'test-namespace',
  },
  spec: {
    category: 'test',
    description: { content: 'Test description', format: 'html' },
    parameters: [],
  },
};

const mockServiceNamespace: ServiceNamespace = {
  name: 'test-service-namespace',
  displayName: 'Test Service Namespace',
  requester: 'test-user',
};

const mockUserProps = {
  isAdmin: false,
  groups: ['test-group'],
  roles: ['test-role'],
};

const mockPurposeOpts: TPurposeOpts = [
  {
    name: 'Development',
    activity: 'Asset Development',
    sfdcRequired: false,
    description: 'Development purpose',
  },
  {
    name: 'Other',
    activity: 'Asset Development',
    sfdcRequired: false,
    description: 'Other purpose',
  },
];

describe('CatalogItemFormReducer', () => {
  describe('reduceFormState', () => {
    describe('init action', () => {
      it('should initialize form state with default values', () => {
        const initialState = reduceFormState(undefined as any, {
          type: 'init',
          catalogItem: mockCatalogItem,
          serviceNamespace: mockServiceNamespace,
          user: mockUserProps,
          purposeOpts: mockPurposeOpts,
          sfdc_enabled: true,
        });

        expect(initialState.user).toEqual(mockUserProps);
        expect(initialState.serviceNamespace).toEqual(mockServiceNamespace);
        expect(initialState.termsOfServiceAgreed).toBe(false);
        expect(initialState.whiteGloved).toBe(false);
        expect(initialState.useAutoDetach).toBe(true);
        expect(initialState.selectedResourcePool).toBeUndefined();
        expect(initialState.workshop).toBeNull();
        expect(initialState.conditionChecks.completed).toBe(false);
      });

      it('should initialize selectedResourcePool as undefined', () => {
        const initialState = reduceFormState(undefined as any, {
          type: 'init',
          catalogItem: mockCatalogItem,
          serviceNamespace: mockServiceNamespace,
          user: mockUserProps,
          purposeOpts: mockPurposeOpts,
          sfdc_enabled: false,
        });

        expect(initialState.selectedResourcePool).toBeUndefined();
      });
    });

    describe('selectedResourcePool action', () => {
      let initialState: ReturnType<typeof reduceFormState>;

      beforeEach(() => {
        initialState = reduceFormState(undefined as any, {
          type: 'init',
          catalogItem: mockCatalogItem,
          serviceNamespace: mockServiceNamespace,
          user: mockUserProps,
          purposeOpts: mockPurposeOpts,
          sfdc_enabled: false,
        });
      });

      it('should set selectedResourcePool when provided', () => {
        const newState = reduceFormState(initialState, {
          type: 'selectedResourcePool',
          selectedResourcePool: 'my-resource-pool',
        });

        expect(newState.selectedResourcePool).toBe('my-resource-pool');
      });

      it('should clear selectedResourcePool when undefined is provided', () => {
        const stateWithPool = reduceFormState(initialState, {
          type: 'selectedResourcePool',
          selectedResourcePool: 'my-resource-pool',
        });

        expect(stateWithPool.selectedResourcePool).toBe('my-resource-pool');

        const clearedState = reduceFormState(stateWithPool, {
          type: 'selectedResourcePool',
          selectedResourcePool: undefined,
        });

        expect(clearedState.selectedResourcePool).toBeUndefined();
      });

      it('should not affect other state properties when updating selectedResourcePool', () => {
        const stateWithChanges = reduceFormState(initialState, {
          type: 'whiteGloved',
          whiteGloved: true,
        });

        const newState = reduceFormState(stateWithChanges, {
          type: 'selectedResourcePool',
          selectedResourcePool: 'test-pool',
        });

        expect(newState.selectedResourcePool).toBe('test-pool');
        expect(newState.whiteGloved).toBe(true);
        expect(newState.useAutoDetach).toBe(true);
        expect(newState.serviceNamespace).toEqual(mockServiceNamespace);
      });
    });

    describe('useAutoDetach action', () => {
      let initialState: ReturnType<typeof reduceFormState>;

      beforeEach(() => {
        initialState = reduceFormState(undefined as any, {
          type: 'init',
          catalogItem: mockCatalogItem,
          serviceNamespace: mockServiceNamespace,
          user: mockUserProps,
          purposeOpts: mockPurposeOpts,
          sfdc_enabled: false,
        });
      });

      it('should set useAutoDetach to false', () => {
        const newState = reduceFormState(initialState, {
          type: 'useAutoDetach',
          useAutoDetach: false,
        });

        expect(newState.useAutoDetach).toBe(false);
      });

      it('should set useAutoDetach to true', () => {
        const stateWithFalse = reduceFormState(initialState, {
          type: 'useAutoDetach',
          useAutoDetach: false,
        });

        const newState = reduceFormState(stateWithFalse, {
          type: 'useAutoDetach',
          useAutoDetach: true,
        });

        expect(newState.useAutoDetach).toBe(true);
      });
    });

    describe('whiteGloved action', () => {
      let initialState: ReturnType<typeof reduceFormState>;

      beforeEach(() => {
        initialState = reduceFormState(undefined as any, {
          type: 'init',
          catalogItem: mockCatalogItem,
          serviceNamespace: mockServiceNamespace,
          user: mockUserProps,
          purposeOpts: mockPurposeOpts,
          sfdc_enabled: false,
        });
      });

      it('should set whiteGloved to true', () => {
        const newState = reduceFormState(initialState, {
          type: 'whiteGloved',
          whiteGloved: true,
        });

        expect(newState.whiteGloved).toBe(true);
      });

      it('should set whiteGloved to false', () => {
        const stateWithTrue = reduceFormState(initialState, {
          type: 'whiteGloved',
          whiteGloved: true,
        });

        const newState = reduceFormState(stateWithTrue, {
          type: 'whiteGloved',
          whiteGloved: false,
        });

        expect(newState.whiteGloved).toBe(false);
      });
    });
  });

  describe('checkCondition', () => {
    it('should return true for truthy condition', () => {
      const result = checkCondition('true', {});
      expect(result).toBe(true);
    });

    it('should return false for falsy condition', () => {
      const result = checkCondition('false', {});
      expect(result).toBe(false);
    });

    it('should evaluate variable conditions', () => {
      const result = checkCondition('user_is_admin', { user_is_admin: true });
      expect(result).toBe(true);
    });

    it('should evaluate complex conditions with variables', () => {
      const result = checkCondition('count > 5', { count: 10 });
      expect(result).toBe(true);
    });

    it('should return false for complex conditions not met', () => {
      const result = checkCondition('count > 5', { count: 3 });
      expect(result).toBe(false);
    });
  });

  describe('checkEnableSubmit', () => {
    let initialState: ReturnType<typeof reduceFormState>;

    beforeEach(() => {
      initialState = reduceFormState(undefined as any, {
        type: 'init',
        catalogItem: mockCatalogItem,
        serviceNamespace: mockServiceNamespace,
        user: mockUserProps,
        purposeOpts: [],
        sfdc_enabled: false,
      });
    });

    it('should return false if condition checks are not completed', () => {
      expect(checkEnableSubmit(initialState)).toBe(false);
    });

    it('should return true if condition checks are completed and no terms of service required', () => {
      const completedState = reduceFormState(initialState, {
        type: 'complete',
        error: '',
        parameters: {},
      });

      expect(checkEnableSubmit(completedState)).toBe(true);
    });
  });
});
