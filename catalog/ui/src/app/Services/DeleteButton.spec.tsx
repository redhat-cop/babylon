import "@testing-library/jest-dom";
import React from "react";
import { render, waitFor, queryByAttribute, fireEvent, screen, cleanup } from "@testing-library/react";
import { DeleteButton } from "./DeleteButton";

describe("DeleteButton", () => {
  test("When DeleteButton layout renders, should display Delete Button", async () => {
    const onClick = jest.fn();
    const { getByText, debug } =
      render(<DeleteButton onClick={onClick} />);

    const testVar = getByText("Delete");
    await waitFor(() => expect(testVar).toBeInTheDocument());
  });

  test("When DeleteButton layout renders, should display Delete Button", async () => {
    const onClick = jest.fn();
    const { getByText, debug } =
      render(<DeleteButton onClick={onClick} />);
    const button = screen.getByText("Delete");
    fireEvent.click(button);
    await waitFor(() => expect(onClick).toBeCalledTimes(1));

  });
})