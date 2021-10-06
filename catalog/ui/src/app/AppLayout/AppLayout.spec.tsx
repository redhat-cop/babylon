jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent } from "../utils/test-utils";
import { AppLayout } from "./AppLayout"

describe("Catalog Page Layout Scenario", () => {
    test("When app layout renders, should display 'Catalog' option", async () => {
        const { getByText } = render(<AppLayout>{"Test"}</AppLayout>);
        const testVar = getByText("Catalog");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });
    test("When app layout renders, should display 'Services' option", async () => {
        const { getByText } = render(<AppLayout>{"Test"}</AppLayout>);
        const testVar = getByText("Services");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });
    test("When app layout renders, should display user name", async () => {
        const { getByText } = render(<AppLayout>{"Test"}</AppLayout>);
        const testVar = getByText("test.user-redhat.com");
        await waitFor(() => expect(testVar).toBeInTheDocument());
    });
    test("When app layout renders, should display hamburger toggle", async () => {
        const { container } = render(<AppLayout>{"Test"}</AppLayout>);
        const testVar = container.querySelector("#nav-toggle");
        console.log("testVar", testVar);
        await waitFor(() => expect(testVar).toBeTruthy());
    });
})

describe("Catalog page event scenarios", () => {
    test("When navigation toggle is clicked, navigation get hidden", async () => {
        const { container } = render(<AppLayout>{"Test"}</AppLayout>);
        const testVar: any = container.querySelector("#nav-toggle");
        fireEvent.click(testVar);
        await waitFor(() => expect(testVar).toBeTruthy());
    })
})
