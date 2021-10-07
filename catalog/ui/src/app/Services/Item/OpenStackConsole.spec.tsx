// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import {OpenStackConsole} from "./OpenStackConsole"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("OpenStackConsole", () => {
    test("When OpenStackConsole layout renders, should display 'start' option", async () => {
        const { getByText, debug } = 
        render(<OpenStackConsole 
        resourceClaim= {"A Practical Introduction to Container Security"}/>
      );
      const testVar = getByText("Start");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When OpenStackConsole layout renders, should display 'Reconnect' option", async () => {
        const { getByText, debug } = 
        render(<OpenStackConsole 
        resourceClaim= {"A Practical Introduction to Container Security"}/>
      );
      const testVar = getByText("Reconnect");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When OpenStackConsole layout renders, should display 'Reboot' option", async () => {
        const { getByText, debug } = 
        render(<OpenStackConsole 
        resourceClaim= {"A Practical Introduction to Container Security"}/>
      );
      const testVar = getByText("Reboot");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

})