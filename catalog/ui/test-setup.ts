import { TextEncoder, TextDecoder } from 'util';

Object.assign(globalThis, { TextEncoder, TextDecoder });

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import '@testing-library/jest-dom';
import fetchMock from 'jest-fetch-mock';

fetchMock.enableMocks();
jest.mock(
  'asciidoctor',
  () => jest.fn(() => 'mocked'), // <= ...this mock function
);
