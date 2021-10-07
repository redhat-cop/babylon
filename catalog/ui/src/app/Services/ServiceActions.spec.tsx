// jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { Provider } from 'react-redux';
import user from "@testing-library/user-event"

import {ServiceActions} from "./ServiceActions"
import { BrowserRouter as Router } from 'react-router-dom';
// import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

const getById = queryByAttribute.bind(null, 'id');

// test.afterEach(cleanup)

describe("ServiceActions", () => {
    test("When ServiceActions layout renders, should display ServiceActions", async () => {
        const openDeleteModal = jest.fn();
        const openScheduleActionModal = jest.fn();
        const openStartModal = jest.fn();
        const openStopModal = jest.fn();

        const { getByText, debug } = 
        render(<ServiceActions
            position="right"
            resourceClaim={"resourceClaim"}
            actionHandlers={{
              delete: () => openDeleteModal("resourceClaim"),
              lifespan: () => openScheduleActionModal("resourceClaim", 'retirement'),
              runtime: () => openScheduleActionModal("resourceClaim", 'stop'),
              start: () => openStartModal("resourceClaim", 'start'),
              stop: () => openStopModal("resourceClaim", 'stop'),
            }}
          />
      );
      const testVar = getByText("Actions");
      await waitFor(() => expect(testVar).toBeInTheDocument());
    });

    test("When ServiceActions layout renders, should display Options Delete", async () => {
        const openDeleteModal = jest.fn();
        const openScheduleActionModal = jest.fn();
        const openStartModal = jest.fn();
        const openStopModal = jest.fn();

        const { getByText, debug } = render(<ServiceActions
            position="right"
            resourceClaim={"resourceClaim"}
            actionHandlers={{
              delete: () => openDeleteModal("resourceClaim"),
              lifespan: () => openScheduleActionModal("resourceClaim", 'retirement'),
              runtime: () => openScheduleActionModal("resourceClaim", 'stop'),
              start: () => openStartModal("resourceClaim", 'start'),
              stop: () => openStopModal("resourceClaim", 'stop'),
            }}
          />
      );
      const button = screen.getByText("Actions");
      fireEvent.click(button);
        await waitFor(() => expect(getByText("Delete")).toBeInTheDocument());
 });

    test("When ServiceActions layout renders, should display Stop", async () => {
        const openDeleteModal = jest.fn();
        const openScheduleActionModal = jest.fn();
        const openStartModal = jest.fn();
        const openStopModal = jest.fn();

        const { getByText, debug } = render(<ServiceActions
            position="right"
            resourceClaim={"resourceClaim"}
            actionHandlers={{
              delete: () => openDeleteModal("resourceClaim"),
              lifespan: () => openScheduleActionModal("resourceClaim", 'retirement'),
              runtime: () => openScheduleActionModal("resourceClaim", 'stop'),
              start: () => openStartModal("resourceClaim", 'start'),
              stop: () => openStopModal("resourceClaim", 'stop'),
            }}
          />
      );
      const button = screen.getByText("Actions");
      fireEvent.click(button);
      await waitFor(() => expect(getByText("Stop")).toBeInTheDocument());
    });

    test("When ServiceActions layout renders, should display Start", async () => {
        const openDeleteModal = jest.fn();
        const openScheduleActionModal = jest.fn();
        const openStartModal = jest.fn();
        const openStopModal = jest.fn();

        const { getByText, debug } = render(<ServiceActions
            position="right"
            resourceClaim={"resourceClaim"}
            actionHandlers={{
              delete: () => openDeleteModal("resourceClaim"),
              lifespan: () => openScheduleActionModal("resourceClaim", 'retirement'),
              runtime: () => openScheduleActionModal("resourceClaim", 'stop'),
              start: () => openStartModal("resourceClaim", 'start'),
              stop: () => openStopModal("resourceClaim", 'stop'),
            }}
          />
      );
      const button = screen.getByText("Actions");
      fireEvent.click(button);
      await waitFor(() => expect(getByText("Start")).toBeInTheDocument());
    });

    test("When ServiceActions layout renders, should display Adjust Lifespan", async () => {
        const openDeleteModal = jest.fn();
        const openScheduleActionModal = jest.fn();
        const openStartModal = jest.fn();
        const openStopModal = jest.fn();

        const { getByText, debug } = render(<ServiceActions
            position="right"
            resourceClaim={"resourceClaim"}
            actionHandlers={{
              delete: () => openDeleteModal("resourceClaim"),
              lifespan: () => openScheduleActionModal("resourceClaim", 'retirement'),
              runtime: () => openScheduleActionModal("resourceClaim", 'stop'),
              start: () => openStartModal("resourceClaim", 'start'),
              stop: () => openStopModal("resourceClaim", 'stop'),
            }}
          />
      );
      const button = screen.getByText("Actions");
      fireEvent.click(button);
      await waitFor(() => expect(getByText("Adjust Lifespan")).toBeInTheDocument());
    });

    test("When ServiceActions layout renders, should display Adjust Runtime", async () => {
        const openDeleteModal = jest.fn();
        const openScheduleActionModal = jest.fn();
        const openStartModal = jest.fn();
        const openStopModal = jest.fn();

        const { getByText, debug } = render(<ServiceActions
            position="right"
            resourceClaim={"resourceClaim"}
            actionHandlers={{
              delete: () => openDeleteModal("resourceClaim"),
              lifespan: () => openScheduleActionModal("resourceClaim", 'retirement'),
              runtime: () => openScheduleActionModal("resourceClaim", 'stop'),
              start: () => openStartModal("resourceClaim", 'start'),
              stop: () => openStopModal("resourceClaim", 'stop'),
            }}
          />
      );
      const button = screen.getByText("Actions");
      fireEvent.click(button);
      await waitFor(() => expect(getByText("Adjust Runtime")).toBeInTheDocument());
    });
})
