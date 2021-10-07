import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import {ServicesItemStartModal} from "./ServicesItemStartModal";

describe("ServicesItemStartModal", () => {
    test("When ServicesItemStartModal layout renders, should display 'Confirm' option", async () => {
        const closeModal = jest.fn();
        const handleStart = jest.fn();
        const { getByText, debug } = 
        render(<ServicesItemStartModal key="start"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStart}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText("Confirm");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemStartModal layout renders, should display 'Cancle' option", async () => {
        const closeModal = jest.fn();
        const handleStart = jest.fn();
        const { getByText, debug } = 
        render(<ServicesItemStartModal key="start"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStart}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText("Cancel");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemStartModal layout renders, should display 'Start Service?' option", async () => {
        const closeModal = jest.fn();
        const handleStart = jest.fn();
        const catalogItemDisplayName = "Service";
        const { getByText, debug } = 
        render(<ServicesItemStartModal key="start"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStart}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText(`Start ${catalogItemDisplayName}?`);
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemStartModal layout renders, should Confirm button click once", async () => {
        const closeModal = jest.fn();
        const handleStart = jest.fn();

        const { getByText, debug } = render(<ServicesItemStartModal key="start"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStart}
        resourceClaim={"ServiceCatalogName"}/>
      );
      const button = screen.getByText("Confirm");
      fireEvent.click(button);
        await waitFor(() => expect(handleStart).toBeCalledTimes(1));
    });

    test("When ServicesItemStartModal layout renders, should Cancle button click once", async () => {
        const closeModal = jest.fn();
        const handleStart = jest.fn();

        const { getByText, debug } = render(<ServicesItemStartModal key="start"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStart}
        resourceClaim={"ServiceCatalogName"}/>
      );
      const button = screen.getByText("Cancel");
      fireEvent.click(button);
        await waitFor(() => expect(closeModal).toBeCalledTimes(1));
    });


   
})