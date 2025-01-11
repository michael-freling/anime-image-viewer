import { Button, ToggleButtonGroup } from "@mui/joy";
import { FC, useState } from "react";

interface ModeButtonsProps<Mode extends string> {
  onChange: (mode: Mode) => void;
  defaultMode: Mode;
  enabledModes: Array<{
    value: Mode;
    text: string;
  }>;
}

const ModeButtons: FC<ModeButtonsProps<any>> = ({ onChange, defaultMode, enabledModes }) => {
  const [mode, setMode] = useState(defaultMode);

  return (
    <ToggleButtonGroup
      value={mode}
      onChange={(event, newMode) => {
        if (newMode === null || mode === newMode) {
          return;
        }
        setMode(newMode);
        onChange(newMode);
      }}
    >
      {enabledModes.map(({ value, text }) => (
        <Button key={value} value={value}>
          {text}
        </Button>
      ))}
    </ToggleButtonGroup>
  );
};

export default ModeButtons;
