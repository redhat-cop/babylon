import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import {ServicesItemDeleteModal} from "./ServicesItemDeleteModal";

describe("ServicesItemDeleteModal", () => {
    test("When ServicesItemDeleteModal layout renders, should display 'Confirm' option", async () => {
        const closeModal = jest.fn();
        const handleDelete = jest.fn();
        const { getByText, debug } = 
        render(<ServicesItemDeleteModal key="delete"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleDelete}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText("Confirm");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemDeleteModal layout renders, should display 'Cancle' option", async () => {
        const closeModal = jest.fn();
        const handleDelete = jest.fn();
        const { getByText, debug } = 
        render(<ServicesItemDeleteModal key="delete"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleDelete}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText("Cancel");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemDeleteModal layout renders, should display 'Delete ServiceName?' option", async () => {
        const closeModal = jest.fn();
        const handleDelete = jest.fn();
        const catalogItemDisplayName = "Service";
        const { getByText, debug } = 
        render(<ServicesItemDeleteModal key="delete"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleDelete}
        resourceClaim= {"ServiceCatalogName"}/>
      );

      const testVar = getByText(`Delete ${catalogItemDisplayName}?`);
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServicesItemDeleteModal layout renders, should Confirm button click once", async () => {
        const closeModal = jest.fn();
        const handleDelete = jest.fn();

        const { getByText, debug } = render(<ServicesItemDeleteModal key="delete"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleDelete}
        resourceClaim={"ServiceCatalogName"}/>
      );
      const button = screen.getByText("Confirm");
      fireEvent.click(button);
        await waitFor(() => expect(handleDelete).toBeCalledTimes(1));
    });

    test("When ServicesItemDeleteModal layout renders, should Cancle button click once", async () => {
        const closeModal = jest.fn();
        const handleDelete = jest.fn();

        const { getByText, debug } = render(<ServicesItemDeleteModal key="delete"
        isOpen={true}
        onClose={closeModal}
        onConfirm={handleDelete}
        resourceClaim={"ServiceCatalogName"}/>
      );
      const button = screen.getByText("Cancel");
      fireEvent.click(button);
        await waitFor(() => expect(closeModal).toBeCalledTimes(1));
    });
})