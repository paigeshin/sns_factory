const cp = require("child_process");
const readline = require("readline");
const ytdl = require("ytdl-core");
const ffmpeg = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

// Ensure directory exists before writing files
async function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  try {
    await fs.promises.access(dir, fs.constants.F_OK);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`Creating directory: ${dir}`);
      await fs.promises.mkdir(dir, { recursive: true });
    } else {
      throw error;
    }
  }
}

// Download and encode video from YouTube
async function downloadVideo(url, outputPath) {
  return new Promise(async (resolve, reject) => {
    await ensureDirectoryExists(outputPath);
    console.log(`Downloading and encoding video from: ${url}`);

    // Tracking progress for audio, video, and merging
    const tracker = {
      start: Date.now(),
      audio: { downloaded: 0, total: Infinity },
      video: { downloaded: 0, total: Infinity },
      merged: { frame: 0, speed: "0x", fps: 0 },
    };

    // Getting highest quality audio and video streams
    const audio = ytdl(url, { quality: "highestaudio" }).on(
      "progress",
      (_, downloaded, total) => {
        tracker.audio = { downloaded, total };
      }
    );
    const video = ytdl(url, { quality: "highestvideo" }).on(
      "progress",
      (_, downloaded, total) => {
        tracker.video = { downloaded, total };
      }
    );

    // Prepare the progress bar
    let progressbarHandle = null;
    const progressbarInterval = 1000;
    const showProgress = () => {
      readline.cursorTo(process.stdout, 0);
      const toMB = (i) => (i / 1024 / 1024).toFixed(2);

      process.stdout.write(
        `Audio  | ${(
          (tracker.audio.downloaded / tracker.audio.total) *
          100
        ).toFixed(2)}% processed `
      );
      process.stdout.write(
        `(${toMB(tracker.audio.downloaded)}MB of ${toMB(
          tracker.audio.total
        )}MB).${" ".repeat(10)}\n`
      );

      process.stdout.write(
        `Video  | ${(
          (tracker.video.downloaded / tracker.video.total) *
          100
        ).toFixed(2)}% processed `
      );
      process.stdout.write(
        `(${toMB(tracker.video.downloaded)}MB of ${toMB(
          tracker.video.total
        )}MB).${" ".repeat(10)}\n`
      );

      process.stdout.write(
        `Merged | processing frame ${tracker.merged.frame} `
      );
      process.stdout.write(
        `(at ${tracker.merged.fps} fps => ${tracker.merged.speed}).${" ".repeat(
          10
        )}\n`
      );

      process.stdout.write(
        `running for: ${((Date.now() - tracker.start) / 1000 / 60).toFixed(
          2
        )} Minutes.`
      );
      readline.moveCursor(process.stdout, 0, -3);
    };

    // Start ffmpeg process
    const ffmpegProcess = cp.spawn(
      ffmpeg,
      [
        "-loglevel",
        "8",
        "-hide_banner", // Reducing log verbosity
        "-progress",
        "pipe:3", // Progress messages
        "-i",
        "pipe:4",
        "-i",
        "pipe:5", // Input pipes
        "-map",
        "0:a",
        "-map",
        "1:v", // Mapping audio and video
        "-c:v",
        "copy", // Copying video codec
        outputPath, // Output file
      ],
      {
        windowsHide: true,
        stdio: ["inherit", "inherit", "inherit", "pipe", "pipe", "pipe"],
      }
    );

    ffmpegProcess.on("close", (code) => {
      clearInterval(progressbarHandle);
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpegProcess.on("error", reject);

    // Link streams
    // FFmpeg creates the transformer streams and we just have to insert / read data
    ffmpegProcess.stdio[3].on("data", (chunk) => {
      // Start the progress bar
      if (!progressbarHandle)
        progressbarHandle = setInterval(showProgress, progressbarInterval);
      // Parse the param=value list returned by ffmpeg
      const lines = chunk.toString().trim().split("\n");
      const args = {};
      for (const l of lines) {
        const [key, value] = l.split("=");
        args[key.trim()] = value.trim();
      }
      tracker.merged = args;
    });

    audio.pipe(ffmpegProcess.stdio[4]);
    video.pipe(ffmpegProcess.stdio[5]);
  });
}

// Function to convert MKV to MP4
function convertMkvToMp4(mkvFilePath, mp4FilePath) {
  return new Promise((resolve, reject) => {
    console.log(`Converting ${mkvFilePath} to ${mp4FilePath}`);
    const resolvedMkvPath = path.resolve(mkvFilePath);
    const resolvedMp4Path = path.resolve(mp4FilePath);

    const ffmpegProcess = cp.spawn("ffmpeg", [
      "-i",
      resolvedMkvPath, // Input file
      "-codec",
      "copy", // Copying codecs
      resolvedMp4Path, // Output file
    ]);

    ffmpegProcess.on("close", (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpegProcess.stderr.on("data", (data) => {
      console.error(`ffmpeg stderr: ${data}`);
    });
  });
}

// Example usage
// const outputFilePath = path.resolve(__dirname, "out.mkv");
// downloadVideo("https://www.youtube.com/shorts/HatwoBP6Low", outputFilePath)
//   .then(() => console.log("Video downloaded and encoded successfully"))
//   .catch((error) => console.error("Error in downloading video:", error));

const mkvFilePath = path.resolve(__dirname, "out.mkv");
const mp4FilePath = path.resolve(__dirname, "output.mp4");
convertMkvToMp4(mkvFilePath, mp4FilePath)
  .then(() => console.log("MKV to MP4 conversion finished successfully"))
  .catch((error) => console.error("Error in conversion:", error));
