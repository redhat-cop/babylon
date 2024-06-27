import '@testing-library/jest-dom';
import fetchMock from 'jest-fetch-mock';

fetchMock.enableMocks();
jest.mock(
  'asciidoctor',
  () => jest.fn(() => 'mocked'), // <= ...this mock function
);
