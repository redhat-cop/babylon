import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { ServiceStatus } from "./ServiceStatus";

describe("ServiceStatus", () => {
    test("When ServiceStatus layout renders, should display ServiceStatus", async () => {

        const { getByText, debug } =
            render(<ServiceStatus
                creationTime={1}
                resource={"Ansible Automation Controller Advanced"}
                resourceTemplate={"specResources[0].template"}
            />
            );
        console.log(debug);
        const testVar = getByText("Available");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });
})