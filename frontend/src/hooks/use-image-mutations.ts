/**
 * Image mutation hooks (delete, etc.).
 *
 * Follows the same pattern as `use-season-mutations.ts`: calls the Wails
 * binding then invalidates relevant React Query caches.
 */
import {
  useMutation,
  UseMutationResult,
  useQueryClient,
} from "@tanstack/react-query";
import { ImageService } from "../lib/api";
import { qk } from "../lib/query-keys";

export interface DeleteImagesVariables {
  imageIds: number[];
}

export function useDeleteImages(): UseMutationResult<
  void,
  Error,
  DeleteImagesVariables
> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteImagesVariables>({
    mutationFn: async ({ imageIds }) => {
      await ImageService.DeleteImages(imageIds);
    },
    onSuccess: () => {
      // Broad invalidation since deleted images could appear in any anime/search view.
      void queryClient.invalidateQueries({ queryKey: qk.anime.all });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
    },
  });
}
