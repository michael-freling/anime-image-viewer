import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/joy";
import { FC, useEffect, useState } from "react";

interface AddEntryModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    entryType: string,
    entryNumber: number | null,
    displayName: string
  ) => Promise<void>;
  nextSeasonNumber: number; // pre-fetched from backend
}

const AddEntryModal: FC<AddEntryModalProps> = ({
  open,
  onClose,
  onSubmit,
  nextSeasonNumber,
}) => {
  const [entryType, setEntryType] = useState<"season" | "movie" | "other">(
    "season"
  );
  const [seasonNumber, setSeasonNumber] = useState(nextSeasonNumber);
  const [movieYear, setMovieYear] = useState(new Date().getFullYear());
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setEntryType("season");
      setSeasonNumber(nextSeasonNumber);
      setMovieYear(new Date().getFullYear());
      setName("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, nextSeasonNumber]);

  const displayName = (() => {
    switch (entryType) {
      case "season":
        return `Season ${seasonNumber}`;
      case "movie":
        return name ? `${name} (${movieYear})` : "";
      case "other":
        return name;
    }
  })();

  const isValid = (() => {
    switch (entryType) {
      case "season":
        return seasonNumber > 0;
      case "movie":
        return name.trim() !== "" && movieYear > 0;
      case "other":
        return name.trim() !== "";
    }
  })();

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let numberValue: number | null = null;
      let nameValue = "";
      switch (entryType) {
        case "season":
          numberValue = seasonNumber;
          nameValue = `Season ${seasonNumber}`;
          break;
        case "movie":
          numberValue = movieYear;
          nameValue = name.trim();
          break;
        case "other":
          nameValue = name.trim();
          break;
      }
      await onSubmit(entryType, numberValue, nameValue);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: 400 }}>
        <ModalClose />
        <Typography level="title-md">Add Entry</Typography>
        <Stack spacing={2} sx={{ mt: 2 }}>
          {/* Type selector */}
          <FormControl>
            <FormLabel>Type</FormLabel>
            <RadioGroup
              orientation="horizontal"
              value={entryType}
              onChange={(e) => {
                setEntryType(e.target.value as "season" | "movie" | "other");
                setName("");
                setError(null);
              }}
            >
              <Radio value="season" label="Season" />
              <Radio value="movie" label="Movie" />
              <Radio value="other" label="Other" />
            </RadioGroup>
          </FormControl>

          {/* Season fields */}
          {entryType === "season" && (
            <FormControl>
              <FormLabel>Number</FormLabel>
              <Input
                type="number"
                value={seasonNumber}
                onChange={(e) => setSeasonNumber(Number(e.target.value))}
                slotProps={{ input: { min: 1 } }}
              />
            </FormControl>
          )}

          {/* Movie fields */}
          {entryType === "movie" && (
            <>
              <FormControl>
                <FormLabel>Name</FormLabel>
                <Input
                  autoFocus
                  placeholder="e.g. Mugen Train"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Year</FormLabel>
                <Input
                  type="number"
                  value={movieYear}
                  onChange={(e) => setMovieYear(Number(e.target.value))}
                  slotProps={{ input: { min: 1900, max: 2100 } }}
                />
              </FormControl>
            </>
          )}

          {/* Other fields */}
          {entryType === "other" && (
            <FormControl>
              <FormLabel>Name</FormLabel>
              <Input
                autoFocus
                placeholder="e.g. Downloaded Art"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
              />
            </FormControl>
          )}

          {/* Display name preview */}
          {displayName && (
            <Box
              sx={{
                bgcolor: "neutral.softBg",
                borderRadius: "sm",
                px: 1.5,
                py: 1,
              }}
            >
              <Typography level="body-xs" sx={{ color: "text.tertiary" }}>
                Will be created as:
              </Typography>
              <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                {displayName}
              </Typography>
            </Box>
          )}

          {error && (
            <Typography level="body-sm" color="danger">
              {error}
            </Typography>
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="plain" color="neutral" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!isValid || submitting}
              loading={submitting}
              onClick={handleSubmit}
            >
              Create
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  );
};

export default AddEntryModal;
