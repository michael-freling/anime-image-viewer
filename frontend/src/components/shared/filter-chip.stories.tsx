import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { FilterChip } from "./filter-chip";

const meta = {
  title: "Shared/FilterChip",
  component: FilterChip,
  args: {
    onRemove: fn(),
  },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Outdoor",
    variant: "include",
  },
};

export const Include: Story = {
  args: {
    label: "Sunset",
    variant: "include",
  },
};

export const Exclude: Story = {
  args: {
    label: "Indoor",
    variant: "exclude",
  },
};

export const LongLabel: Story = {
  args: {
    label: "Very long tag name that might overflow",
    variant: "include",
  },
};
