import { useState } from "react";

// https://www.developerway.com/posts/how-to-handle-errors-in-react#part6
export function useCallbackWithErrorHandler(callback: () => Promise<void>) {
  const [, setState] = useState();

  return async () => {
    try {
      await callback();
    } catch (e) {
      setState(() => {
        throw e;
      });
    }
  };
}
