import { execFile } from "node:child_process";
import { appConfig } from "./config.js";
import { getActiveDownloads } from "./downloadManager.js";

function exec(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} failed: ${stderr || error.message}`));
        return;
      }
      resolve((stdout || stderr).trim());
    });
  });
}

async function getVersion(command: string): Promise<string> {
  try {
    return await exec(command, ["--version"]);
  } catch {
    return "unknown";
  }
}

async function runUpdate(): Promise<void> {
  if (getActiveDownloads() > 0) {
    console.log("[updater] Active downloads in progress, skipping update cycle");
    return;
  }

  console.log("[updater] Starting update check...");

  // yt-dlp update
  try {
    const oldVersion = await getVersion("yt-dlp");
    await exec("yt-dlp", ["-U"]);
    const newVersion = await getVersion("yt-dlp");

    if (oldVersion !== newVersion) {
      console.log(`[updater] yt-dlp updated: ${oldVersion} → ${newVersion}`);
    } else {
      console.log(`[updater] yt-dlp is up to date (${newVersion})`);
    }
  } catch (error) {
    console.error(
      `[updater] yt-dlp update failed:`,
      error instanceof Error ? error.message : error,
    );
  }

  // SomeDL update
  try {
    const oldVersion = await getVersion("somedl");
    await exec("pip", ["install", "--upgrade", "somedl", "-q"]);
    const newVersion = await getVersion("somedl");

    if (oldVersion !== newVersion) {
      console.log(`[updater] SomeDL updated: ${oldVersion} → ${newVersion}`);
    } else {
      console.log(`[updater] SomeDL is up to date (${newVersion})`);
    }
  } catch (error) {
    console.error(
      `[updater] SomeDL update failed:`,
      error instanceof Error ? error.message : error,
    );
  }
}

export function startUpdater(): void {
  const { intervalMs, intervalHours } = appConfig.updater;

  console.log(
    `[updater] Scheduled auto-updates every ${intervalHours}h for yt-dlp and SomeDL`,
  );

  const timer = setInterval(() => {
    void runUpdate();
  }, intervalMs);

  // Don't prevent the process from exiting
  timer.unref();
}
