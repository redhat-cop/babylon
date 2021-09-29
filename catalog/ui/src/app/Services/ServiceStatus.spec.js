// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import {ServiceStatus} from "./ServiceStatus"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("ServiceStatus", () => {
    test("When ServiceStatus layout renders, should display ServiceStatus", async () => {

        const { getByText, debug } = 
        render(<ServiceStatus
            creationTime={"01/10/2021, 18:29:08 (2 days from now)"}
            resource={"Ansible Automation Controller Advanced"}
            resourceTemplate={"specResources[0].template"}
          />
      );
      console.log(debug);
      const testVar = getByText("Available");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });
})