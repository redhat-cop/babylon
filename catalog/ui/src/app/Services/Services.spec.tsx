// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import {Services} from "./Services"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("ServiceServicessItem", () => {
    test("When Services layout renders, should display Services", async () => {

        const { getByText, debug } = render(<Services location={"any/a"}/>);
      console.log(debug);
      const testVar = getByText("Available");
      await waitFor(() => expect(testVar).toBeInTheDocument());
})

})