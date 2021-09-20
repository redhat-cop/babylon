jest.mock('../api');
import "@testing-library/jest-dom";

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from 'react-redux';

import { AppLayout } from "./AppLayout"
import { BrowserRouter as Router } from 'react-router-dom';
import { getApiSession, listClusterCustomObject } from "@app/api";
import { store } from '@app/store';

describe("Catalog Page", () => {
//   it("sampe test", ()=> {
//     expect(1+2).toBe(3);
//   })
  it("When app layout renders, Should display 'Catalog' and 'Services' option", async () => {
    const { getByText } = render(<Provider store={store}><Router><AppLayout><h1>{"Test"}</h1></AppLayout></Router></Provider>);
    const testVar = getByText("Skip to Content");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  })
});
