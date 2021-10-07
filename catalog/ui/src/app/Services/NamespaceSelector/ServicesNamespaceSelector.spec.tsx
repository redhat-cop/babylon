import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { ServicesNamespaceSelector } from "./ServicesNamespaceSelector";

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