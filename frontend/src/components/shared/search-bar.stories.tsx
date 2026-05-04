import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { SearchBar } from "./search-bar";

const meta = {
  title: "Shared/SearchBar",
  component: SearchBar,
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof SearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "",
  },
};

export const WithValue: Story = {
  args: {
    value: "naruto",
  },
};

export const MediumSize: Story = {
  args: {
    value: "",
    size: "md",
  },
};

export const MediumWithValue: Story = {
  args: {
    value: "attack on titan",
    size: "md",
  },
};

export const CustomPlaceholder: Story = {
  args: {
    value: "",
    placeholder: "Search tags...",
  },
};
