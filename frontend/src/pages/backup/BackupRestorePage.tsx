import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Stack,
  Table,
  Typography,
} from "@mui/joy";
import { FC, useCallback, useEffect, useState } from "react";
import {
  BackupFrontendService,
  BackupInfo,
  ConfigFrontendService,
  ConfigSettings,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

const BackupRestorePage: FC = () => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [configSettings, setConfigSettings] = useState<ConfigSettings | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [backupTargetDir, setBackupTargetDir] = useState("");
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  // Restore confirmation dialog state
  const [confirmRestore, setConfirmRestore] = useState<BackupInfo | null>(null);
  const [restoreImages, setRestoreImages] = useState(false);
  const [targetDir, setTargetDir] = useState("");

  // Delete confirmation dialog state
  const [confirmDelete, setConfirmDelete] = useState<BackupInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [backupList, config] = await Promise.all([
        BackupFrontendService.ListBackups(),
        ConfigFrontendService.GetConfig(),
      ]);
      setBackups(backupList ?? []);
      setConfigSettings(config);
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
      const path = await BackupFrontendService.Backup(includeImages, backupTargetDir);
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
      await BackupFrontendService.Restore(
        backup.path,
        withImages,
        targetDir
      );
      setRestoreSuccess(true);
    } catch (err) {
      setRestoreError(String(err));
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleDelete(backup: BackupInfo) {
    setIsDeleting(true);
    setDeleteError(null);
    setConfirmDelete(null);
    try {
      await BackupFrontendService.DeleteBackup(backup.path);
      await fetchData();
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setIsDeleting(false);
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
              <Stack spacing={1}>
                <Typography level="title-sm">Target Directory</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Input
                    fullWidth
                    readOnly
                    value={backupTargetDir}
                    placeholder="(default)"
                    size="sm"
                  />
                  <Button
                    size="sm"
                    variant="outlined"
                    disabled={isBackingUp}
                    onClick={async () => {
                      try {
                        const dir =
                          await BackupFrontendService.SelectDirectory();
                        if (dir) {
                          setBackupTargetDir(dir);
                        }
                      } catch (err) {
                        console.error("Failed to select directory", err);
                      }
                    }}
                  >
                    Browse
                  </Button>
                  {backupTargetDir && (
                    <Button
                      size="sm"
                      variant="plain"
                      color="neutral"
                      onClick={() => setBackupTargetDir("")}
                    >
                      Clear
                    </Button>
                  )}
                </Stack>
              </Stack>
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
            {deleteError && (
              <Alert color="danger" sx={{ mb: 2 }}>
                {deleteError}
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
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="sm"
                            variant="outlined"
                            color="warning"
                            disabled={isRestoring || isDeleting}
                            onClick={() => {
                              setRestoreImages(false);
                              setTargetDir("");
                              setConfirmRestore(backup);
                            }}
                          >
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="outlined"
                            color="danger"
                            disabled={isRestoring || isDeleting}
                            onClick={() => {
                              setDeleteError(null);
                              setConfirmDelete(backup);
                            }}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Settings Section */}
        {configSettings && (
          <Card variant="outlined">
            <CardContent>
              <Typography level="title-lg">Settings</Typography>
              <Divider sx={{ my: 1 }} />
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Backup Directory</FormLabel>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Input
                      fullWidth
                      readOnly
                      value={configSettings.backupDirectory}
                      size="sm"
                    />
                    <Button
                      size="sm"
                      variant="outlined"
                      onClick={async () => {
                        try {
                          const dir =
                            await ConfigFrontendService.SelectDirectory();
                          if (dir) {
                            setConfigSettings({
                              ...configSettings,
                              backupDirectory: dir,
                            });
                          }
                        } catch (err) {
                          console.error("Failed to select directory", err);
                        }
                      }}
                    >
                      Browse
                    </Button>
                  </Stack>
                </FormControl>
                <FormControl>
                  <FormLabel>Retention Count</FormLabel>
                  <Input
                    type="number"
                    value={configSettings.retentionCount}
                    onChange={(e) =>
                      setConfigSettings({
                        ...configSettings,
                        retentionCount: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    slotProps={{ input: { min: 1 } }}
                    size="sm"
                    sx={{ maxWidth: 200 }}
                  />
                </FormControl>
                <Checkbox
                  label="Enable Idle Backup"
                  checked={configSettings.idleBackupEnabled}
                  onChange={(e) =>
                    setConfigSettings({
                      ...configSettings,
                      idleBackupEnabled: e.target.checked,
                    })
                  }
                />
                <Checkbox
                  label="Include Images in Idle Backup"
                  checked={configSettings.idleBackupIncludeImages}
                  onChange={(e) =>
                    setConfigSettings({
                      ...configSettings,
                      idleBackupIncludeImages: e.target.checked,
                    })
                  }
                />
                <FormControl>
                  <FormLabel>Idle Minutes</FormLabel>
                  <Input
                    type="number"
                    value={configSettings.idleMinutes}
                    onChange={(e) =>
                      setConfigSettings({
                        ...configSettings,
                        idleMinutes: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    slotProps={{ input: { min: 1 } }}
                    size="sm"
                    sx={{ maxWidth: 200 }}
                  />
                </FormControl>
                <Button
                  variant="solid"
                  color="primary"
                  disabled={isSavingSettings}
                  startDecorator={
                    isSavingSettings ? <CircularProgress size="sm" /> : null
                  }
                  sx={{ alignSelf: "flex-start" }}
                  onClick={async () => {
                    setIsSavingSettings(true);
                    setSettingsError(null);
                    setSettingsSuccess(null);
                    try {
                      await ConfigFrontendService.UpdateConfig(configSettings);
                      setSettingsSuccess("Settings saved.");
                    } catch (err) {
                      setSettingsError(String(err));
                    } finally {
                      setIsSavingSettings(false);
                    }
                  }}
                >
                  {isSavingSettings ? "Saving..." : "Save"}
                </Button>
                {settingsSuccess && (
                  <Alert color="success">{settingsSuccess}</Alert>
                )}
                {settingsError && (
                  <Alert color="danger">{settingsError}</Alert>
                )}
              </Stack>
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
              <Stack spacing={1}>
                <Typography level="title-sm">
                  Target Directory
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Input
                    fullWidth
                    readOnly
                    value={targetDir}
                    placeholder="(default)"
                    size="sm"
                  />
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={async () => {
                      try {
                        const dir =
                          await BackupFrontendService.SelectDirectory();
                        if (dir) {
                          setTargetDir(dir);
                        }
                      } catch (err) {
                        console.error("Failed to select directory", err);
                      }
                    }}
                  >
                    Browse
                  </Button>
                  {targetDir && (
                    <Button
                      size="sm"
                      variant="plain"
                      color="neutral"
                      onClick={() => setTargetDir("")}
                    >
                      Clear
                    </Button>
                  )}
                </Stack>
              </Stack>
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
        {/* Delete Confirmation Modal */}
        <Modal
          open={confirmDelete !== null}
          onClose={() => setConfirmDelete(null)}
        >
          <ModalDialog variant="outlined" role="alertdialog">
            <Typography level="title-lg">Confirm Delete</Typography>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={2}>
              <Typography level="body-md">
                Are you sure you want to delete the backup created on{" "}
                <strong>
                  {confirmDelete
                    ? formatDate(confirmDelete.createdAt)
                    : ""}
                </strong>
                ? This action cannot be undone.
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="plain"
                  color="neutral"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="solid"
                  color="danger"
                  onClick={() => {
                    if (confirmDelete) {
                      handleDelete(confirmDelete);
                    }
                  }}
                >
                  Delete
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
