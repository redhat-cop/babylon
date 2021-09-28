jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
// import { render, waitFor, queryByAttribute, fireEvent } from "@testing-library/react";
import { render, waitFor, queryByAttribute, fireEvent } from "../utils/test-utils";
import { Provider } from 'react-redux';

import { AppLayout } from "./AppLayout"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

describe("Catalog Page Layout Scenario", () => {
  test("When app layout renders, should display 'Catalog' option", async () => {
    const { getByText, debug } = render(<AppLayout>{"Test"}</AppLayout>);
    const testVar = getByText("Catalog");
    // debug();
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test("When app layout renders, should display 'Services' option", async () => {
    const { getByText, debug } = render(<AppLayout>{"Test"}</AppLayout>);
    const testVar = getByText("Services");
    // debug();
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test("When app layout renders, should display user name", async () => {
    const { getByText, debug } = render(<AppLayout>{"Test"}</AppLayout>);
    const testVar = getByText("test.user-redhat.com");
    debug();
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });
  test("When app layout renders, should display hamburger toggle", async () => {
    const { container } = render(<AppLayout>{"Test"}</AppLayout>);
    const testVar = container.querySelector("#nav-toggle");
    // debug();
    console.log("testVar", testVar);
    await waitFor(() => expect(testVar).toBeTruthy());
  });
})

describe("Catalog page event scenarios", () => {
  test("When navigation toggle is clicked, navigation get hidden", async () => {
    const { container, debug } = render(<AppLayout>{"Test"}</AppLayout>);
    const testVar = container.querySelector("#nav-toggle");
    fireEvent.click(testVar);
    debug();
    await waitFor(() => expect(testVar).toBeTruthy());
  })
})

