import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { TriStateCheckbox } from "./tri-state-checkbox";

const meta = {
  title: "UI/TriStateCheckbox",
  component: TriStateCheckbox,
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof TriStateCheckbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    state: "unchecked",
    label: "Outdoor",
  },
};

export const Checked: Story = {
  args: {
    state: "checked",
    label: "Outdoor",
  },
};

export const Indeterminate: Story = {
  args: {
    state: "indeterminate",
    label: "Mixed state tag",
  },
};

export const PendingAdding: Story = {
  args: {
    state: "unchecked",
    pending: "adding",
    label: "Sunset",
  },
};

export const PendingRemoving: Story = {
  args: {
    state: "checked",
    pending: "removing",
    label: "Rain",
  },
};

export const WithCount: Story = {
  args: {
    state: "checked",
    label: "Action",
    count: 12,
  },
};

export const UncheckedWithCount: Story = {
  args: {
    state: "unchecked",
    label: "Landscape",
    count: 5,
  },
};
