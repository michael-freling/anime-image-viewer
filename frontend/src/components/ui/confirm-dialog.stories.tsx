import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ConfirmDialog } from "./confirm-dialog";

const meta = {
  title: "UI/ConfirmDialog",
  component: ConfirmDialog,
  args: {
    open: true,
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Confirm action",
    description: "Are you sure you want to proceed?",
  },
};

export const Danger: Story = {
  args: {
    title: "Delete anime",
    description:
      "This will permanently delete the anime and all associated data. This action cannot be undone.",
    variant: "danger",
    confirmLabel: "Delete",
  },
};

export const Warning: Story = {
  args: {
    title: "Remove tag",
    description: "This tag will be removed from all selected images.",
    variant: "default",
    confirmLabel: "Remove",
    cancelLabel: "Keep",
  },
};

export const NoDescription: Story = {
  args: {
    title: "Discard changes?",
  },
};

export const CustomLabels: Story = {
  args: {
    title: "Overwrite existing data",
    description: "Importing will replace the current data for this season.",
    confirmLabel: "Overwrite",
    cancelLabel: "Go back",
  },
};
