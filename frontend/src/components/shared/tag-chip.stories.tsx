import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { TagChip } from "./tag-chip";
import type { Tag } from "../../types";

const sampleTag: Tag = { id: 1, name: "Sunset", category: "scene" };
const natureTage: Tag = { id: 2, name: "Rain", category: "nature" };
const characterTag: Tag = { id: 3, name: "Naruto", category: "character" };

const meta = {
  title: "Shared/TagChip",
  component: TagChip,
} satisfies Meta<typeof TagChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tag: sampleTag,
  },
};

export const Active: Story = {
  args: {
    tag: sampleTag,
    active: true,
  },
};

export const Excluded: Story = {
  args: {
    tag: sampleTag,
    excluded: true,
  },
};

export const WithRemove: Story = {
  args: {
    tag: natureTage,
    active: true,
    onRemove: fn(),
  },
};

export const Clickable: Story = {
  args: {
    tag: characterTag,
    onClick: fn(),
  },
};

export const SmallSize: Story = {
  args: {
    tag: sampleTag,
    active: true,
    size: "sm",
  },
};

export const NatureCategory: Story = {
  args: {
    tag: natureTage,
    active: true,
  },
};

export const CharacterCategory: Story = {
  args: {
    tag: characterTag,
    active: true,
  },
};
