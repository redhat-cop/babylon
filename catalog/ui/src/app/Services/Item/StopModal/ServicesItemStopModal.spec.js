// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import { ServicesItemStopModal } from "./ServicesItemStopModal"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("ServicesItemStopModal", () => {
    test("When ServicesItemStopModal layout renders, should display 'Confirm' option", async () => {
        const closeModal = jest.fn();
        const handleSop = jest.fn();
        const { getByText, debug } =
            render(<ServicesItemStopModal key="stop"
                isOpen={"true"}
                onClose={closeModal}
                onConfirm={handleSop}
                resourceClaim={"ServiceCatalogName"} />
            );

        const testVar = getByText("Confirm");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemStopModal layout renders, should display 'Cancle' option", async () => {
        const closeModal = jest.fn();
        const handleSop = jest.fn();
        const { getByText, debug } =
            render(<ServicesItemStopModal key="stop"
                isOpen={"true"}
                onClose={closeModal}
                onConfirm={handleSop}
                resourceClaim={"ServiceCatalogName"} />
            );

        const testVar = getByText("Cancel");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemStopModal layout renders, should display 'stop Service?' option", async () => {
        const closeModal = jest.fn();
        const handleSop = jest.fn();
        const catalogItemDisplayName = "Service";
        const { getByText, debug } =
            render(<ServicesItemStopModal key="stop"
                isOpen={"true"}
                onClose={closeModal}
                onConfirm={handleSop}
                resourceClaim={"ServiceCatalogName"} />
            );

        const testVar = getByText(`Stop ${catalogItemDisplayName}?`);
        await waitFor(() => expect(testVar).toBeInTheDocument());
        console.log(debug);
    });

    test("When ServicesItemStopModal layout renders, should Confirm button click once", async () => {
        const closeModal = jest.fn();
        const handleSop = jest.fn();

        const { getByText, debug } = render(<ServicesItemStopModal key="stop"
            isOpen={"true"}
            onClose={closeModal}
            onConfirm={handleSop}
            resourceClaim={"ServiceCatalogName"} />
        );
        const button = screen.getByText("Confirm");
        fireEvent.click(button);
        await waitFor(() => expect(handleSop).toBeCalledTimes(1));
    });

    test("When ServicesItemStopModal layout renders, should Cancle button click once", async () => {
        const closeModal = jest.fn();
        const handleSop = jest.fn();

        const { getByText, debug } = render(<ServicesItemStopModal key="stop"
            isOpen={"true"}
            onClose={closeModal}
            onConfirm={handleSop}
            resourceClaim={"ServiceCatalogName"} />
        );
        const button = screen.getByText("Cancel");
        fireEvent.click(button);
        await waitFor(() => expect(closeModal).toBeCalledTimes(1));
    });

})
