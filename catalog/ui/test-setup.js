import fetchMock from 'jest-fetch-mock';
import '@testing-library/jest-dom/extend-expect';

fetchMock.enableMocks();

delete window.location;
window.location = { assign: jest.fn() };
