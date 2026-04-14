/**
 * Tests for `useConfig` and `useUpdateConfig`.
 */
const getConfigMock = jest.fn();
const updateConfigMock = jest.fn();
jest.mock("../../src/lib/api", () => ({
  __esModule: true,
  ConfigFrontendService: {
    GetConfig: (...args: unknown[]) => getConfigMock(...args),
    UpdateConfig: (...args: unknown[]) => updateConfigMock(...args),
  },
}));

import { act } from "react-dom/test-utils";
import { useConfig, useUpdateConfig } from "../../src/hooks/use-config";
import {
  createTestQueryClient,
  renderHookWithClient,
  waitFor,
} from "../test-utils";

const sample = {
  imageRootDirectory: "/root",
  configDirectory: "/cfg",
  logDirectory: "/log",
  backupDirectory: "/backup",
  retentionCount: 5,
  idleBackupEnabled: false,
  idleBackupIncludeImages: false,
  idleMinutes: 15,
};

describe("use-config", () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    updateConfigMock.mockReset();
  });

  test("useConfig fetches the settings", async () => {
    getConfigMock.mockResolvedValue(sample);
    const { result, unmount } = renderHookWithClient(() => useConfig());
    await waitFor(() => result.current.isSuccess);
    expect(result.current.data).toEqual(sample);
    unmount();
  });

  test("useUpdateConfig invalidates the config cache", async () => {
    const client = createTestQueryClient();
    getConfigMock.mockResolvedValue(sample);
    updateConfigMock.mockResolvedValue(undefined);

    const read = renderHookWithClient(() => useConfig(), { client });
    await waitFor(() => read.result.current.isSuccess);

    const mut = renderHookWithClient(() => useUpdateConfig(), { client });
    await act(async () => {
      await mut.result.current.mutateAsync({ ...sample, retentionCount: 10 });
    });
    expect(updateConfigMock).toHaveBeenCalledWith({ ...sample, retentionCount: 10 });
    expect(getConfigMock).toHaveBeenCalledTimes(2);
    read.unmount();
    mut.unmount();
  });
});
