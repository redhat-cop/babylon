// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import { ServicesNamespaceSelector } from "./ServicesNamespaceSelector"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("ServicesNamespaceSelector", () => {
    test("When ServicesNamespaceSelector layout renders, should display all projects ", async () => {
        const ns = "";
        const { getByText, debug } =
            render(<ServicesNamespaceSelector
                current={"all projects"}
                namespaces={[]}
                onSelect={(ns) => { }}
            />
            );

        const testVar = getByText("Project: all projects");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });
})