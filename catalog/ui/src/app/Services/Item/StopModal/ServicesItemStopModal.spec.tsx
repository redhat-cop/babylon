import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import {ServicesItemStopModal} from "./ServicesItemStopModal";

describe("ServicesItemStopModal", () => {
    test("When ServicesItemStopModal layout renders, should display 'Confirm' option", async () => {
        const closeModal = jest.fn();
        const handleStop = jest.fn();
        const { getByText, debug } = 
        render(<ServicesItemStopModal key="stop"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStop}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText("Confirm");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemStopModal layout renders, should display 'Cancle' option", async () => {
        const closeModal = jest.fn();
        const handleStop = jest.fn();
        const { getByText, debug } = 
        render(<ServicesItemStopModal key="stop"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStop}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText("Cancel");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemStopModal layout renders, should display 'stop Service?' option", async () => {
        const closeModal = jest.fn();
        const handleStop = jest.fn();
        const catalogItemDisplayName = "Service";
        const { getByText, debug } = 
        render(<ServicesItemStopModal key="stop"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStop}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText(`Stop ${catalogItemDisplayName}?`);
      await waitFor(() => expect(testVar).toBeInTheDocument());
      console.log(debug);
    });

    test("When ServicesItemStopModal layout renders, should Confirm button click once", async () => {
        const closeModal = jest.fn();
        const handleStop = jest.fn();

        const { getByText, debug } = render(<ServicesItemStopModal key="stop"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStop}
        resourceClaim={"ServiceCatalogName"}/>
      );
      const button = screen.getByText("Confirm");
      fireEvent.click(button);
        await waitFor(() => expect(handleStop).toBeCalledTimes(1));
    });

    test("When ServicesItemStopModal layout renders, should Cancle button click once", async () => {
        const closeModal = jest.fn();
        const handleStop = jest.fn();

        const { getByText, debug } = render(<ServicesItemStopModal key="stop"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleStop}
        resourceClaim={"ServiceCatalogName"}/>
      );
      const button = screen.getByText("Cancel");
      fireEvent.click(button);
        await waitFor(() => expect(closeModal).toBeCalledTimes(1));
    });

})