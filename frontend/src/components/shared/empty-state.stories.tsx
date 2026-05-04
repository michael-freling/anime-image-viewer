import type { Meta, StoryObj } from "@storybook/react";
import { ImageOff, Search, FolderOpen } from "lucide-react";
import { Button } from "@chakra-ui/react";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Shared/EmptyState",
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "No images found",
    description: "Try adjusting your search filters or importing new images.",
    icon: ImageOff,
  },
};

export const WithAction: Story = {
  args: {
    title: "No results",
    description: "Your search did not match any images.",
    icon: Search,
    action: <Button size="sm">Clear filters</Button>,
  },
};

export const WithoutIcon: Story = {
  args: {
    title: "Empty folder",
    description: "This folder does not contain any images yet.",
  },
};

export const WithoutDescription: Story = {
  args: {
    title: "No anime added",
    icon: FolderOpen,
  },
};

export const WithoutAction: Story = {
  args: {
    title: "No tags assigned",
    description: "Select images and use the tag editor to assign tags.",
    icon: Search,
  },
};
