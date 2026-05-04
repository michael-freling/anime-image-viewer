import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ImageThumbnail } from "./image-thumbnail";
import type { ImageFile } from "../../types";

const sampleImage: ImageFile = {
  id: 1,
  name: "sunset-beach.jpg",
  path: "/files/anime/sunset-beach.jpg",
};

const meta = {
  title: "Shared/ImageThumbnail",
  component: ImageThumbnail,
  args: {
    image: sampleImage,
    width: 200,
    height: 200,
  },
} satisfies Meta<typeof ImageThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Selected: Story = {
  args: {
    selected: true,
    selectMode: true,
    onClick: fn(),
  },
};

export const Pending: Story = {
  args: {
    rubberBandPending: true,
    selectMode: true,
    onClick: fn(),
  },
};

export const SelectMode: Story = {
  args: {
    selectMode: true,
    onClick: fn(),
  },
};

export const Clickable: Story = {
  args: {
    onClick: fn(),
  },
};

export const LargeSize: Story = {
  args: {
    width: 300,
    height: 300,
  },
};
