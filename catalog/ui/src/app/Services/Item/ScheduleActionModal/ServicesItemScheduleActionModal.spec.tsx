// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import { ServicesItemScheduleActionModal } from "./ServicesItemScheduleActionModal"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("ServicesItemScheduleActionModal", () => {
    test("When ServicesItemScheduleActionModal layout renders, should display 'Confirm' option", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();
        const { getByText, debug } =
            render(
                <ServicesItemScheduleActionModal key="scheduleAction"
                    action={"retirement"}
                    isOpen={true}
                    onClose={closeModal}
                    onConfirm={handleScheduleAction}
                    resourceClaim={"ServiceCatalogName"}
                />

                // <ServicesItemScheduleActionModal key="scheduleAction"
                //     action={"stop"}
                //     isOpen={true}
                //     onClose={closeModal}
                //     onConfirm={handleScheduleAction}
                //     resourceClaim={"ServiceCatalogName"}
                // />
            );
        console.log(debug);
        const testVar = getByText("Confirm");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemScheduleActionModal layout renders, should display 'Cancle' option", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();
        const { getByText, debug } =
            render(<ServicesItemScheduleActionModal key="scheduleAction"
                action={"retirement"}
                isOpen={true}
                onClose={closeModal}
                onConfirm={handleScheduleAction}
                resourceClaim={"ServiceCatalogName"}
            />
            );

        const testVar = getByText("Cancel");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemScheduleActionModal layout renders, should display 'stop Service?' option", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();
        const catalogItemDisplayName = "A Practical Introduction to Container Security";
        const { getByText, debug } =
            render(<ServicesItemScheduleActionModal key="scheduleAction"
                action={"retirement"}
                isOpen={true}
                onClose={closeModal}
                onConfirm={handleScheduleAction}
                resourceClaim={"ServiceCatalogName"}
            />
            );

        const testVar = getByText(`${catalogItemDisplayName} retirement`);
        await waitFor(() => expect(testVar).toBeInTheDocument());
        console.log(debug);
    });

    test("When ServicesItemScheduleActionModal layout renders, should display 'stop Service?' option", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();
        const catalogItemDisplayName = "A Practical Introduction to Container Security";
        const { getByText, debug } =
            render(<ServicesItemScheduleActionModal key="scheduleAction"
                action={"retirement"}
                isOpen={true}
                onClose={closeModal}
                onConfirm={handleScheduleAction}
                resourceClaim={"ServiceCatalogName"}
            />
            );

        const testVar = getByText("Retirement Time");
        await waitFor(() => expect(testVar).toBeInTheDocument());
        console.log(debug);
    });

    test("When ServicesItemScheduleActionModal layout renders, should display 'stop Service?' option", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();
        const catalogItemDisplayName = "A Practical Introduction to Container Security";
        const { getByText, debug } =
            render(<ServicesItemScheduleActionModal key="scheduleAction"
                action={"stop"}
                isOpen={true}
                onClose={closeModal}
                onConfirm={handleScheduleAction}
                resourceClaim={"ServiceCatalogName"}
            />
            );

        const testVar = getByText(`${catalogItemDisplayName} stop`);
        await waitFor(() => expect(testVar).toBeInTheDocument());
        console.log(debug);
    });

    test("When ServicesItemScheduleActionModal layout renders, should display 'stop Service?' option", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();
        const catalogItemDisplayName = "A Practical Introduction to Container Security";
        const { getByText, debug } =
            render(<ServicesItemScheduleActionModal key="scheduleAction"
                action={"stop"}
                isOpen={true}
                onClose={closeModal}
                onConfirm={handleScheduleAction}
                resourceClaim={"ServiceCatalogName"}
            />
            );

        const testVar = getByText("Stop Time");
        await waitFor(() => expect(testVar).toBeInTheDocument());
        console.log(debug);
    });


    test("When ServicesItemScheduleActionModal layout renders, should Confirm button click once", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();

        const { getByText, debug } =
            render(<ServicesItemScheduleActionModal key="scheduleAction"
                action={"retirement"}
                isOpen={true}
                onClose={closeModal}
                onConfirm={handleScheduleAction}
                resourceClaim={"ServiceCatalogName"}
            />
            );
        const button = screen.getByText("Confirm");
        fireEvent.click(button);
        await waitFor(() => expect(handleScheduleAction).toBeCalledTimes(1));
    });

    test("When ServicesItemScheduleActionModal layout renders, should Cancle button click once", async () => {
        const closeModal = jest.fn();
        const handleScheduleAction = jest.fn();

        const { getByText, debug } =
            render(<ServicesItemScheduleActionModal key="scheduleAction"
                action={"retirement"}
                isOpen={true}
                onClose={closeModal}
                onConfirm={handleScheduleAction}
                resourceClaim={"ServiceCatalogName"}
            />
            );
        const button = screen.getByText("Cancel");
        fireEvent.click(button);
        await waitFor(() => expect(closeModal).toBeCalledTimes(1));
    });

})