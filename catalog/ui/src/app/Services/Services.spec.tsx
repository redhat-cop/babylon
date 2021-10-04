// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import { Services } from "./Services"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("Services", () => {
  test("When Services layout renders, should display Services Label", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    console.log(debug);
    const testVar = getByText("Services");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display search filter", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const testVar = getByText("Filter...");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should be call Actions once", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const button = screen.getByText("Actions");
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeCalledTimes(1));
  })

  test("When Services layout renders, should display Delete Action", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const button = screen.getByText("Actions");
    fireEvent.click(button);
    const testVar = getByText("Delete Selected");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display Start Action", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const button = screen.getByText("Actions");
    fireEvent.click(button);
    const testVar = getByText("Start Selected");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display Stop Action", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const button = screen.getByText("Actions");
    fireEvent.click(button);
    const testVar = getByText("Stop Selected");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display names of services", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const testVar = getByText("Name");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display GUID of services", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const testVar = getByText("GUID");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display Status of services", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const testVar = getByText("Status");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display Lab Interface of services", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const testVar = getByText("Lab Interface	");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When Services layout renders, should display Actions of services", async () => {

    const { getByText, debug } = render(<Services location={"any"} />);
    const testVar = getByText("Actions");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })
})