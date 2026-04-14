/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `ImportFoldersDialog`.
 *
 * The Chakra Dialog stub renders null when `open=false`, so we can assert
 * "renders nothing" by the absence of the dialog role. Select-all and
 * submit behaviour are driven through the stubbed Checkbox and Button.
 */
jest.mock("@chakra-ui/react", () =>
  require("../chakra-stub").chakraStubFactory(),
);
jest.mock("lucide-react", () =>
  require("../chakra-stub").lucideStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ImportFoldersDialog } from "../../../src/components/shared/import-folders-dialog";

interface Rendered {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
  rerender: (el: React.ReactElement) => void;
}

function render(el: React.ReactElement): Rendered {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(el);
  });
  return {
    container,
    root,
    rerender(next) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

const FOLDERS = [
  { id: 1, name: "anime-a" },
  { id: 2, name: "anime-b" },
  { id: 3, name: "anime-c" },
];

describe("ImportFoldersDialog", () => {
  test("renders nothing when open=false", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: false,
        onClose: jest.fn(),
        folders: FOLDERS,
        onImport: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='import-folders-dialog']"),
    ).toBeNull();
    r.unmount();
  });

  test("renders the dialog title when open=true", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: FOLDERS,
        onImport: jest.fn(),
      }),
    );
    expect(r.container.textContent).toContain("Import folders as anime");
    r.unmount();
  });

  test("renders one row per folder", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: FOLDERS,
        onImport: jest.fn(),
      }),
    );
    const rows = r.container.querySelectorAll(
      "[data-testid='import-folder-row']",
    );
    expect(rows.length).toBe(3);
    r.unmount();
  });

  test("import button is disabled when no folder is selected", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: FOLDERS,
        onImport: jest.fn(),
      }),
    );
    const submit = r.container.querySelector(
      "[data-testid='import-folders-submit']",
    ) as HTMLButtonElement | null;
    expect(submit).not.toBeNull();
    expect(submit!.disabled).toBe(true);
    r.unmount();
  });

  test("select-all toggles selection between all and none", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: FOLDERS,
        onImport: jest.fn(),
      }),
    );
    const selectAll = r.container.querySelector(
      "[data-testid='import-folders-select-all']",
    ) as HTMLElement | null;
    expect(selectAll).not.toBeNull();
    act(() => {
      selectAll!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const submit = r.container.querySelector(
      "[data-testid='import-folders-submit']",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toContain("3 folders");

    act(() => {
      selectAll!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      (r.container.querySelector(
        "[data-testid='import-folders-submit']",
      ) as HTMLButtonElement).disabled,
    ).toBe(true);
    r.unmount();
  });

  test("onImport is called with the selected ids when Import is pressed", async () => {
    const onImport = jest.fn().mockResolvedValue(undefined);
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: FOLDERS,
        onImport,
      }),
    );

    const rowCheckboxes = r.container.querySelectorAll(
      "[data-testid='import-folder-row'] [role='checkbox']",
    );
    act(() => {
      (rowCheckboxes[0] as HTMLElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      (rowCheckboxes[2] as HTMLElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const submit = r.container.querySelector(
      "[data-testid='import-folders-submit']",
    ) as HTMLButtonElement;
    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toEqual([1, 3]);
    r.unmount();
  });

  test("clicking Cancel fires onClose", () => {
    const onClose = jest.fn();
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose,
        folders: FOLDERS,
        onImport: jest.fn(),
      }),
    );
    const cancel = r.container.querySelector(
      "[data-testid='import-folders-cancel']",
    ) as HTMLButtonElement;
    act(() => {
      cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("loading state shows a loading message", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: [],
        onImport: jest.fn(),
        loading: true,
      }),
    );
    expect(r.container.textContent).toContain("Loading folders");
    r.unmount();
  });

  test("error prop renders an ErrorAlert", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: FOLDERS,
        onImport: jest.fn(),
        error: "Server down",
      }),
    );
    expect(r.container.textContent).toContain("Server down");
    r.unmount();
  });

  test("empty folders with no error shows 'No unassigned' message", () => {
    const r = render(
      createElement(ImportFoldersDialog, {
        open: true,
        onClose: jest.fn(),
        folders: [],
        onImport: jest.fn(),
      }),
    );
    expect(r.container.textContent).toContain("No unassigned");
    r.unmount();
  });
});
