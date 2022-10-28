import '@testing-library/jest-dom';
import fetchMock from 'jest-fetch-mock';

fetchMock.enableMocks();

// delete window.location;
// window.location = { assign: jest.fn() };
