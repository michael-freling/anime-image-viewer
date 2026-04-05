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
  Stack,
  Typography,
} from "@mui/joy";
import { FC, useCallback, useEffect, useState } from "react";
import {
  ConfigFrontendService,
  ConfigSettings,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

const SettingsPage: FC = () => {
  const [settings, setSettings] = useState<ConfigSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const config = await ConfigFrontendService.GetConfig();
      setSettings(config);
    } catch (err) {
      console.error("Failed to fetch config", err);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    if (!settings) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await ConfigFrontendService.UpdateConfig(settings);
      setSaveSuccess(
        "Settings saved successfully. Some changes (such as directory changes) may require an application restart."
      );
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBrowse(
    field: keyof Pick<
      ConfigSettings,
      | "imageRootDirectory"
      | "configDirectory"
      | "logDirectory"
      | "backupDirectory"
    >
  ) {
    try {
      const dir = await ConfigFrontendService.SelectDirectory();
      if (dir && settings) {
        setSettings({ ...settings, [field]: dir });
      }
    } catch (err) {
      console.error("Failed to select directory", err);
    }
  }

  if (!settings) {
    return (
      <Layout.Main actionHeader={<Typography level="h4">Settings</Typography>}>
        <Stack spacing={3} sx={{ p: 2 }} alignItems="center">
          <CircularProgress />
        </Stack>
      </Layout.Main>
    );
  }

  return (
    <Layout.Main actionHeader={<Typography level="h4">Settings</Typography>}>
      <Stack spacing={3} sx={{ p: 2 }}>
        {/* General Settings */}
        <Card variant="outlined">
          <CardContent>
            <Typography level="title-lg">General Settings</Typography>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Image Root Directory</FormLabel>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Input
                    fullWidth
                    readOnly
                    value={settings.imageRootDirectory}
                    size="sm"
                  />
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => handleBrowse("imageRootDirectory")}
                  >
                    Browse
                  </Button>
                </Stack>
              </FormControl>
              <FormControl>
                <FormLabel>Config Directory</FormLabel>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Input
                    fullWidth
                    readOnly
                    value={settings.configDirectory}
                    size="sm"
                  />
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => handleBrowse("configDirectory")}
                  >
                    Browse
                  </Button>
                </Stack>
              </FormControl>
              <FormControl>
                <FormLabel>Log Directory</FormLabel>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Input
                    fullWidth
                    readOnly
                    value={settings.logDirectory}
                    size="sm"
                  />
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => handleBrowse("logDirectory")}
                  >
                    Browse
                  </Button>
                </Stack>
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        {/* Backup Settings */}
        <Card variant="outlined">
          <CardContent>
            <Typography level="title-lg">Backup Settings</Typography>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>Backup Directory</FormLabel>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Input
                    fullWidth
                    readOnly
                    value={settings.backupDirectory}
                    size="sm"
                  />
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => handleBrowse("backupDirectory")}
                  >
                    Browse
                  </Button>
                </Stack>
              </FormControl>
              <FormControl>
                <FormLabel>Retention Count</FormLabel>
                <Input
                  type="number"
                  value={settings.retentionCount}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
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
                checked={settings.idleBackupEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    idleBackupEnabled: e.target.checked,
                  })
                }
              />
              <Checkbox
                label="Include Images in Idle Backup"
                checked={settings.idleBackupIncludeImages}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    idleBackupIncludeImages: e.target.checked,
                  })
                }
              />
              <FormControl>
                <FormLabel>Idle Minutes</FormLabel>
                <Input
                  type="number"
                  value={settings.idleMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      idleMinutes: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  slotProps={{ input: { min: 1 } }}
                  size="sm"
                  sx={{ maxWidth: 200 }}
                />
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        {/* Save Button and Alerts */}
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <Button
              variant="solid"
              color="primary"
              onClick={handleSave}
              disabled={isSaving}
              startDecorator={isSaving ? <CircularProgress size="sm" /> : null}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="outlined"
              color="neutral"
              disabled={isSaving}
              onClick={async () => {
                try {
                  const defaults =
                    await ConfigFrontendService.GetDefaultConfig();
                  setSettings(defaults);
                } catch (err) {
                  console.error("Failed to get default config", err);
                }
              }}
            >
              Reset to Defaults
            </Button>
          </Stack>
          {saveSuccess && <Alert color="success">{saveSuccess}</Alert>}
          {saveError && <Alert color="danger">{saveError}</Alert>}
        </Stack>

        <Typography level="body-sm" color="neutral">
          Note: Changes to directories require an application restart to take
          effect.
        </Typography>
      </Stack>
    </Layout.Main>
  );
};

export default SettingsPage;
