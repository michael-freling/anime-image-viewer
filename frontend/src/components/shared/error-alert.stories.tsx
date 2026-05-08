import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ErrorAlert } from "./error-alert";

const meta = {
  title: "Shared/ErrorAlert",
  component: ErrorAlert,
} satisfies Meta<typeof ErrorAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    message: "Failed to load images. Please check your connection.",
  },
};

export const WithRetry: Story = {
  args: {
    message: "Network timeout while fetching data.",
    onRetry: fn(),
  },
};

export const CustomTitle: Story = {
  args: {
    title: "Import failed",
    message: "3 files could not be imported because they exceed the maximum size.",
    onRetry: fn(),
  },
};

export const LongMessage: Story = {
  args: {
    message:
      "An unexpected error occurred while processing your request. The server returned a 500 Internal Server Error. This may be a temporary issue. Please try again later or contact support if the problem persists.",
  },
};
