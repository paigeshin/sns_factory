const fs = require("fs");
const ytdl = require("ytdl-core");
const path = require("path");

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

function download(url, outputPath) {
  return new Promise((resolve, reject) => {
    ytdl(url)
      .pipe(fs.createWriteStream(outputPath))
      .on("finish", () => {
        console.log("Download completed.");
        resolve();
      })
      .on("error", (error) => {
        console.error("Error occurred:", error);
        reject(error);
      });
  });
}

async function downloadYoutubeVideo(channel, url, outputDirectory, videoID) {
  try {
    const info = await ytdl.getInfo(url);

    const format = ytdl.chooseFormat(info.formats, {
      quality: "highest",
      filter: (format) => format.hasAudio && format.hasVideo,
    });
    console.log("Chosen Format!");
    console.log(format);
    console.log("Download URL: ", format.url);

    const outputPath = path.join(
      __dirname,
      outputDirectory,
      "videos",
      videoID,
      `${channel}_${videoID}.${format.container}`
    );

    await ensureDirectoryExists(outputPath);

    await download(url, outputPath);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Example usage
// downloadYoutubeVideo(
//   "minandjae",
//   "https://www.youtube.com/shorts/NNeHrkNWyog",
//   "../../resources/downloads/workout/youtube/whatmotivatedyou/shorts",
//   "NNeHrkNWyog"
// );

ytdl("https://www.youtube.com/shorts/xiSUOlBVL7U", { quality: 18 }).pipe(
  fs.createWriteStream("video.mp4")
);
