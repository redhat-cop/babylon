// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import { ServicesItem } from "./ServicesItem"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("ServicesItem", () => {
  test("When ServicesItem layout renders, should display Services", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Services");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display Service Details", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Service Details");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display Details Tab and to be call once", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const button = screen.getByText("Details");
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeCalledTimes(1));
  })

  test("When ServicesItem layout renders, should display YAML Tab and to be call once", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const button = screen.getByText("YAML");
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeCalledTimes(1));
  })

  test("When ServicesItem layout renders, should display Name", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Name");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })


  test("When ServicesItem layout renders, should display Requested On", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Requested On");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display Retirement", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Retirement");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display GUID", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("GUID");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display UUID", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("UUID");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display Governor", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Governor");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display Status", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Status");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })

  test("When ServicesItem layout renders, should display Scheduled Stop", async () => {
    const { getByText, debug } = render(<ServicesItem location={"1stservice"} />);
    const testVar = getByText("Scheduled Stop");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })


})