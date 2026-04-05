import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { BackupFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";

interface BackupContextType {
  lastBackupTime: string | null;
  isBackingUp: boolean;
}

const BackupContext = createContext<BackupContextType>({
  lastBackupTime: null,
  isBackingUp: false,
});

export function useBackupContext() {
  return useContext(BackupContext);
}

export function BackupProvider({ children }: { children: React.ReactNode }) {
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState<number>(0);
  const [enabled, setEnabled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch config on mount
  useEffect(() => {
    BackupFrontendService.GetBackupConfig()
      .then((config) => {
        setIdleMinutes(config.idleMinutes);
        setEnabled(config.idleBackupEnabled);
      })
      .catch((err) => {
        console.error("Failed to fetch backup config", err);
      });
  }, []);

  const runIdleBackup = useCallback(async () => {
    if (isBackingUp) {
      return;
    }
    setIsBackingUp(true);
    try {
      const result = await BackupFrontendService.RunIdleBackup();
      if (result) {
        setLastBackupTime(new Date().toISOString());
      }
    } catch (err) {
      console.error("Idle backup failed", err);
    } finally {
      setIsBackingUp(false);
    }
  }, [isBackingUp]);

  const resetTimer = useCallback(() => {
    if (!enabled || idleMinutes <= 0) {
      return;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      runIdleBackup();
    }, idleMinutes * 60 * 1000);
  }, [enabled, idleMinutes, runIdleBackup]);

  // Set up idle timer and user activity listeners
  useEffect(() => {
    if (!enabled || idleMinutes <= 0) {
      return;
    }

    const activityEvents = ["mousemove", "keydown", "click", "scroll"];

    const handleActivity = () => {
      resetTimer();
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Start the initial timer
    resetTimer();

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [enabled, idleMinutes, resetTimer]);

  return (
    <BackupContext.Provider value={{ lastBackupTime, isBackingUp }}>
      {children}
    </BackupContext.Provider>
  );
}
