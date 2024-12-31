import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Alert,
  Box,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import { FC } from "react";
import { useImportImageProgress } from "./contexts/ImportImageContext";

const Footer: FC = () => {
  const importProgress = useImportImageProgress();

  if (importProgress.total == 0) {
    return null;
  }

  const completedPercentage =
    (100 * (importProgress.completed + importProgress.failed)) /
    importProgress.total;
  return (
    <AccordionGroup size="sm">
      <Accordion defaultExpanded={true}>
        <Box>
          <AccordionSummary>
            Importing images. ({completedPercentage.toFixed(0)}% completed)
          </AccordionSummary>
          <AccordionDetails>
            <Stack gap={1}>
              <Stack direction="row" gap={1}>
                <LinearProgress
                  determinate
                  value={
                    importProgress.total > 0
                      ? (100 * importProgress.completed) / importProgress.total
                      : 0
                  }
                />
                <Typography>
                  <Typography color="success">
                    {importProgress.completed} successes
                  </Typography>
                  ,{" "}
                  <Typography color="danger">
                    {importProgress.failed} failures
                  </Typography>{" "}
                  of {importProgress.total}
                </Typography>
              </Stack>
              {importProgress.failures.length > 0 && (
                <Alert
                  color="danger"
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                  }}
                >
                  <Typography color="danger">Import failures</Typography>
                  {importProgress.failures.map((failure, index) => (
                    <Stack direction="row" key={index}>
                      <Typography level="title-md" flexWrap="nowrap">
                        {failure.path}
                      </Typography>
                      <Typography level="body-sm">: {failure.error}</Typography>
                    </Stack>
                  ))}
                </Alert>
              )}
            </Stack>
          </AccordionDetails>
        </Box>
      </Accordion>
    </AccordionGroup>
  );
};
export default Footer;
