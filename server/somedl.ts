import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

interface SomeDlOptions {
  url: string;
  cwd: string;
  downloadPlaylist: boolean;
  maxPlaylistItems: number;
}

interface SomeDlResult {
  child: ReturnType<typeof spawn>;
  events: EventEmitter;
}

/**
 * Spawns somedl with the provided configuration and emits progress updates.
 */
export function runSomeDl({ url, cwd, downloadPlaylist, maxPlaylistItems }: SomeDlOptions): SomeDlResult {
  const events = new EventEmitter();
  
  // somedl mostly relies on its config file which we set up in the Dockerfile.
  // We use the -l flag to force it to download into the cwd (which is our isolated temp dir)
  // regardless of the user's global output directory configuration.
  // We also force format to mp3 since amia expects it.
  // --range also caps URLs that are only a playlist, which --get-song doesn't.
  const child = spawn("somedl", [
    "-l", "-f", "mp3", "--no-album",
    "--range", `0:${downloadPlaylist ? maxPlaylistItems : 1}`,
    downloadPlaylist ? "--get-playlist" : "--get-song",
    "--", url,
  ], {
    cwd, // Run in a unique directory to prevent naming collisions
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // Own process group, so cancelling also stops its ffmpeg
  });

  // SomeDL prints no percentages, only a line per finished song ("Downloaded successfully:  2/5 ...")
  const parseProgress = (line: string) => {
    const match = line.match(/Downloaded successfully:\s+(\d+)\/(\d+)/);
    if (!match) return;
    events.emit("progress", (Number(match[1]) / Number(match[2])) * 100);
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  child.stdout.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line) continue;
      events.emit("stdout", line);
      parseProgress(line);
    }
  });

  child.stderr.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line) continue;
      events.emit("stderr", line);
      parseProgress(line);
    }
  });

  child.on("error", (error) => events.emit("error", error));
  child.on("close", (code) => events.emit("close", code));

  return { child, events };
}
