import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ApiProvider } from "../../../lib/api/api-context";
import { render } from "../../../test/render";
import { MemoryProcessingOutcome } from "./MemoryProcessingOutcome";
afterEach(cleanup);
it("shows extraction denials with a readable reason and permissions link", () => {
  render(
    <ApiProvider apiUrl="http://vault.test">
      <MemoryProcessingOutcome
        initial={{
          status: "completed",
          outcomes: [
            { candidateId: "one", status: "DENIED", reason: "no_client_policy" }
          ]
        }}
      />
    </ApiProvider>
  );
  expect(screen.getByText(/0 saved, 0 queued, 1 denied/)).toBeTruthy();
  expect(screen.getByText(/This app has no permissions/)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Manage App permissions" })
      .getAttribute("href")
  ).toBe("/settings/clients");
});
