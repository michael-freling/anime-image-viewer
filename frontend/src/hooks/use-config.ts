/**
 * `useConfig` / `useUpdateConfig` — read + mutate the app-wide `ConfigSettings`
 * (image root, directories, backup defaults, etc.).
 *
 * The mutation invalidates `qk.config()` so the settings page reflects the
 * just-saved values without a manual refetch.
 */
import {
  useMutation,
  UseMutationResult,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { ConfigFrontendService } from "../lib/api";
import type { ConfigSettings } from "../lib/api";
import { qk } from "../lib/query-keys";

export function useConfig(): UseQueryResult<ConfigSettings> {
  return useQuery<ConfigSettings>({
    queryKey: qk.config(),
    queryFn: async () => {
      const settings = (await ConfigFrontendService.GetConfig()) as ConfigSettings;
      return settings;
    },
  });
}

export function useUpdateConfig(): UseMutationResult<
  void,
  Error,
  ConfigSettings
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, ConfigSettings>({
    mutationFn: async (settings) => {
      await ConfigFrontendService.UpdateConfig(settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.config() });
    },
  });
}
