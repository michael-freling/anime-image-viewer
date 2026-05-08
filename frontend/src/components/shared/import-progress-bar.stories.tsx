import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { ImportProgressBar } from "./import-progress-bar";
import { useImportProgressStore } from "../../stores/import-progress-store";

/**
 * Decorator that seeds the import progress store before rendering the story.
 * Clears the store on unmount to avoid leaking state between stories.
 */
function withImportProgress(
  entries: Array<{
    id: string;
    label: string;
    total: number;
    completed: number;
    done?: boolean;
    failed?: number;
  }>,
) {
  return function Decorator(Story: React.ComponentType) {
    const start = useImportProgressStore((s) => s.start);
    const update = useImportProgressStore((s) => s.update);
    const finish = useImportProgressStore((s) => s.finish);

    useEffect(() => {
      for (const entry of entries) {
        start(entry.id, entry.label, entry.total);
        if (entry.completed > 0) {
          update(entry.id, { completed: entry.completed });
        }
        if (entry.done) {
          finish(entry.id);
        }
        if (entry.failed) {
          update(entry.id, { failed: entry.failed });
        }
      }
      return () => {
        // Reset store on cleanup
        useImportProgressStore.setState({ imports: new Map() });
      };
    }, [start, update, finish]);

    return <Story />;
  };
}

const meta = {
  title: "Shared/ImportProgressBar",
  component: ImportProgressBar,
} satisfies Meta<typeof ImportProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    withImportProgress([
      { id: "import-1", label: "Naruto - Season 1", total: 24, completed: 10 },
    ]),
  ],
};

export const HalfComplete: Story = {
  decorators: [
    withImportProgress([
      {
        id: "import-1",
        label: "Attack on Titan - Season 2",
        total: 50,
        completed: 25,
      },
    ]),
  ],
};

export const AlmostDone: Story = {
  decorators: [
    withImportProgress([
      {
        id: "import-1",
        label: "My Hero Academia",
        total: 100,
        completed: 98,
      },
    ]),
  ],
};

export const Complete: Story = {
  decorators: [
    withImportProgress([
      {
        id: "import-1",
        label: "Demon Slayer - Movie",
        total: 30,
        completed: 30,
        done: true,
      },
    ]),
  ],
};

export const WithFailures: Story = {
  decorators: [
    withImportProgress([
      {
        id: "import-1",
        label: "One Piece - Season 3",
        total: 40,
        completed: 37,
        done: true,
        failed: 3,
      },
    ]),
  ],
};

export const MultipleImports: Story = {
  decorators: [
    withImportProgress([
      { id: "import-1", label: "Naruto - Season 1", total: 24, completed: 10 },
      {
        id: "import-2",
        label: "Bleach - Season 2",
        total: 50,
        completed: 50,
        done: true,
      },
    ]),
  ],
};

export const JustStarted: Story = {
  decorators: [
    withImportProgress([
      { id: "import-1", label: "New Import", total: 100, completed: 0 },
    ]),
  ],
};
