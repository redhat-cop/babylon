// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import { DeleteButton } from "./DeleteButton"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("DeleteButton", () => {
    test("When DeleteButton layout renders, should display Delete Button", async () => {
        const onClick = jest.fn();
        const { getByText, debug } =
            render(<DeleteButton onClick={onClick} />);

        const testVar = getByText("Delete");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });
})
