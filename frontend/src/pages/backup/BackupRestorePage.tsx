import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  Modal,
  ModalDialog,
  Stack,
  Table,
  Typography,
} from "@mui/joy";
import { FC, useCallback, useEffect, useState } from "react";
import {
  BackupConfig,
  BackupFrontendService,
  BackupInfo,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

const BackupRestorePage: FC = () => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  // Restore confirmation dialog state
  const [confirmRestore, setConfirmRestore] = useState<BackupInfo | null>(null);
  const [restoreImages, setRestoreImages] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [backupList, backupConfig] = await Promise.all([
        BackupFrontendService.ListBackups(),
        BackupFrontendService.GetBackupConfig(),
      ]);
      setBackups(backupList ?? []);
      setConfig(backupConfig);
    } catch (err) {
      console.error("Failed to fetch backup data", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleBackup() {
    setIsBackingUp(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const path = await BackupFrontendService.Backup(includeImages);
      setBackupSuccess(`Backup created: ${path}`);
      await fetchData();
    } catch (err) {
      setBackupError(String(err));
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleRestore(backup: BackupInfo, withImages: boolean) {
    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(false);
    setConfirmRestore(null);
    try {
      await BackupFrontendService.Restore(backup.path, withImages);
      setRestoreSuccess(true);
    } catch (err) {
      setRestoreError(String(err));
    } finally {
      setIsRestoring(false);
    }
  }

  function formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  }

  return (
    <Layout.Main actionHeader={<Typography level="h4">Backup</Typography>}>
      <Stack spacing={3} sx={{ p: 2 }}>
        {/* Create Backup Section */}
        <Card variant="outlined">
          <CardContent>
            <Typography level="title-lg">Create Backup</Typography>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={2}>
              <Checkbox
                label="Include images"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                disabled={isBackingUp}
              />
              <Button
                variant="solid"
                color="primary"
                onClick={handleBackup}
                disabled={isBackingUp}
                startDecorator={
                  isBackingUp ? <CircularProgress size="sm" /> : null
                }
              >
                {isBackingUp ? "Backing up..." : "Backup Now"}
              </Button>
              {backupSuccess && (
                <Alert color="success">{backupSuccess}</Alert>
              )}
              {backupError && (
                <Alert color="danger">{backupError}</Alert>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Restore Section */}
        <Card variant="outlined">
          <CardContent>
            <Typography level="title-lg">Restore</Typography>
            <Divider sx={{ my: 1 }} />
            {isRestoring && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <CircularProgress size="sm" />
                <Typography>Restoring...</Typography>
              </Stack>
            )}
            {restoreSuccess && (
              <Alert color="success" sx={{ mb: 2 }}>
                Restore completed successfully. Restart the application for
                changes to take full effect.
              </Alert>
            )}
            {restoreError && (
              <Alert color="danger" sx={{ mb: 2 }}>
                {restoreError}
              </Alert>
            )}
            {backups.length === 0 ? (
              <Typography level="body-sm" color="neutral">
                No backups available.
              </Typography>
            ) : (
              <Table stripe="odd" hoverRow>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Includes Images</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.path}>
                      <td>{formatDate(backup.createdAt)}</td>
                      <td>{backup.includesImages ? "Yes" : "No"}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outlined"
                          color="warning"
                          disabled={isRestoring}
                          onClick={() => {
                            setRestoreImages(false);
                            setConfirmRestore(backup);
                          }}
                        >
                          Restore
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Settings Section */}
        {config && (
          <Card variant="outlined">
            <CardContent>
              <Typography level="title-lg">Settings</Typography>
              <Divider sx={{ my: 1 }} />
              <Table>
                <tbody>
                  <tr>
                    <td>
                      <Typography level="title-sm">
                        Backup Directory
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {config.backupDirectory || "(not set)"}
                      </Typography>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <Typography level="title-sm">
                        Retention Count
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {config.retentionCount}
                      </Typography>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <Typography level="title-sm">
                        Idle Backup
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {config.idleBackupEnabled ? "Enabled" : "Disabled"}
                      </Typography>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <Typography level="title-sm">
                        Idle Minutes
                      </Typography>
                    </td>
                    <td>
                      <Typography level="body-sm">
                        {config.idleMinutes}
                      </Typography>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Restore Confirmation Modal */}
        <Modal
          open={confirmRestore !== null}
          onClose={() => setConfirmRestore(null)}
        >
          <ModalDialog variant="outlined" role="alertdialog">
            <Typography level="title-lg">Confirm Restore</Typography>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={2}>
              <Typography level="body-md">
                Are you sure you want to restore from the backup created on{" "}
                <strong>
                  {confirmRestore
                    ? formatDate(confirmRestore.createdAt)
                    : ""}
                </strong>
                ? This will overwrite your current data.
              </Typography>
              {confirmRestore?.includesImages && (
                <Checkbox
                  label="Restore images"
                  checked={restoreImages}
                  onChange={(e) => setRestoreImages(e.target.checked)}
                />
              )}
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="plain"
                  color="neutral"
                  onClick={() => setConfirmRestore(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="solid"
                  color="danger"
                  onClick={() => {
                    if (confirmRestore) {
                      handleRestore(confirmRestore, restoreImages);
                    }
                  }}
                >
                  Restore
                </Button>
              </Stack>
            </Stack>
          </ModalDialog>
        </Modal>
      </Stack>
    </Layout.Main>
  );
};

export default BackupRestorePage;
