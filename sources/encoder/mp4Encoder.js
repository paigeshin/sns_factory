// https://chat.openai.com/c/766465c6-4090-4841-b164-223a6d805fcc
const ffmpeg = require("fluent-ffmpeg");
const ffprobe = require("ffprobe-static");
const fs = require("fs").promises;
const path = require("path");

// Set the ffprobe path for fluent-ffmpeg to use for media file analysis
ffmpeg.setFfprobePath(ffprobe.path);

async function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch (error) {
    if (error.code === "ENOENT") {
      // Directory does not exist, create it
      console.log(`Creating directory: ${dir}`);
      await fs.mkdir(dir, { recursive: true });
    } else {
      throw error; // Rethrow non-ENOENT errors
    }
  }
}

async function deleteFileIfExists(filePath) {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    console.log(`Deleted temporary file: ${filePath}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Error deleting file ${filePath}:`, error);
    }
  }
}

// Function to adjust color properties of a video (brightness, contrast, saturation)
async function adjustColor(
  inputFilePath,
  outputFilePath,
  brightness = 0,
  contrast = 1,
  saturation = 1
) {
  inputFilePath = path.resolve(__dirname, inputFilePath);
  outputFilePath = path.resolve(__dirname, outputFilePath);

  console.log(`Adjusting color properties of ${inputFilePath}`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .videoFilters(
        `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`
      )
      .output(outputFilePath)
      .on("end", () => {
        console.log("Color adjustment completed.");
        resolve();
      })
      .on("error", (err) => {
        console.error("Error in color adjustment:", err);
        reject(err);
      })
      .run();
  });
}

// Function to edit the pitch of audio in a video
async function editPitch(inputFilePath, outputFilePath, pitchFactor) {
  inputFilePath = path.resolve(__dirname, inputFilePath);
  outputFilePath = path.resolve(__dirname, outputFilePath);
  const sampleRate = 44100 * pitchFactor;

  console.log(`Editing pitch of ${inputFilePath}`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .audioFilters(`asetrate=${sampleRate}`)
      .output(outputFilePath)
      .on("end", () => {
        console.log("Pitch editing completed.");
        resolve();
      })
      .on("error", (err) => {
        console.error("Error:", err);
        reject(err);
      })
      .run();
  });
}

// Function to rotate (yaw) a video by a specified degree
async function editYaw(inputFilePath, outputFilePath, rotationDegrees) {
  inputFilePath = path.resolve(__dirname, inputFilePath);
  outputFilePath = path.resolve(__dirname, outputFilePath);
  const radians = (rotationDegrees * Math.PI) / 180;

  console.log(`Rotating video ${inputFilePath}`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .videoFilters(`rotate=${radians}`)
      .output(outputFilePath)
      .on("end", () => {
        console.log("Yaw editing (rotation) completed.");
        resolve();
      })
      .on("error", (err) => {
        console.error("Error:", err);
        reject(err);
      })
      .run();
  });
}

// Function to check if a video file contains an audio stream
function hasAudio(videoPath) {
  videoPath = path.resolve(__dirname, videoPath);
  console.log(`Checking for audio in ${videoPath}`);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error("Error checking audio:", err);
        reject(err);
      } else {
        const audioStream = metadata.streams.find(
          (stream) => stream.codec_type === "audio"
        );
        resolve(!!audioStream);
      }
    });
  });
}

// Function to get the duration of a media file
function getDuration(filePath) {
  filePath = path.resolve(__dirname, filePath);
  console.log(`Getting duration of ${filePath}`);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error("Error getting duration:", err);
        reject(err);
      } else {
        resolve(metadata.format.duration);
      }
    });
  });
}

// Function to determine the appropriate audio codec based on file extension
function getAudioCodec(audioPath) {
  const extension = path.extname(audioPath).toLowerCase();
  switch (extension) {
    case ".mp3":
      return "libmp3lame";
    case ".aac":
      return "aac";
    default:
      return "copy";
  }
}

// Function to convert a video file to MP4 format
async function convertToMP4(inputPath, outputPath) {
  inputPath = path.resolve(__dirname, inputPath);
  outputPath = path.resolve(__dirname, outputPath);
  console.log(`Converting ${inputPath} to MP4 format`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(["-c:v libx264", "-c:a copy"])
      .save(outputPath)
      .on("end", () => {
        console.log("Conversion to MP4 completed.");
        resolve();
      })
      .on("error", (err) => {
        console.error("Error during conversion to MP4:", err);
        reject(err);
      })
      .run();
  });
}

// Function to process the audio of a video file
async function processAudio(
  videoPath,
  audioPath,
  outputPath,
  videoDuration,
  audioCodec,
  overrideAudio
) {
  console.log(`Processing audio for ${videoPath} with codec: ${audioCodec}`);
  return new Promise((resolve, reject) => {
    let command = ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .audioCodec(audioCodec)
      .videoCodec("copy");

    // Determine whether to override existing audio
    if (overrideAudio) {
      console.log("Overriding existing audio");
      command.addOption(["-map", "0:v:0", "-map", "1:a:0"]); // Use video from first input, audio from second input
    } else {
      console.log("Keeping existing audio");
      command.addOption("-map", "0"); // Use all streams from the first input
    }

    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) {
        console.error("Error during ffprobe of audio:", err);
        reject(err);
        return;
      }

      const audioDuration = metadata.format.duration;
      if (audioDuration < videoDuration) {
        // If audio is shorter, loop it until it matches the video duration
        console.log("Looping shorter audio to match video duration");
        command
          .inputOptions(["-stream_loop", "-1"])
          .outputOptions(`-t ${videoDuration}`);
      } else {
        // If audio is longer, cut it to match the video duration
        console.log("Cutting longer audio to match video duration");
        command.outputOptions(`-t ${videoDuration}`);
      }

      command
        .on("error", (err, stdout, stderr) => {
          console.error("Error in audio processing:", err);
          console.error("FFmpeg stderr:", stderr);
          reject(err);
        })
        .on("end", () => {
          console.log("Audio processing and adding completed successfully");
          resolve();
        })
        .save(outputPath);
    });
  });
}

// Main function to process a video with various options like converting to MP4,
// editing pitch, yaw (rotation), color adjustment, and audio processing.
async function encodeForMP4AndSaveOnFile(
  videoPath,
  audioPath,
  finalVideoPath,
  options = {}
) {
  // Resolve file paths to absolute paths
  videoPath = path.resolve(__dirname, videoPath);
  audioPath = audioPath ? path.resolve(__dirname, audioPath) : null;
  finalVideoPath = path.resolve(__dirname, finalVideoPath);
  await ensureDirectoryExists(finalVideoPath);

  let tempVideoPath = videoPath;
  const originalVideoPath = videoPath;
  const videoExtension = path.extname(videoPath).toLowerCase();

  try {
    // Check if the video has an audio stream
    const videoHasAudio = await hasAudio(videoPath);
    let videoDuration;

    // Convert to MP4 if required and the video is not already in MP4 format
    console.log("Converting video to MP4 format...");
    tempVideoPath = path.resolve(__dirname, `temp_video.${videoExtension}`);
    await convertToMP4(videoPath, tempVideoPath);

    // Adjust pitch if specified in the options
    if (options.pitchFactor) {
      console.log("Adjusting pitch of the video...");
      const pitchedVideoPath = path.resolve(__dirname, "temp_pitched.mp4");
      await editPitch(tempVideoPath, pitchedVideoPath, options.pitchFactor);
      tempVideoPath = pitchedVideoPath;
    }

    // Adjust yaw (rotation) if specified in the options
    if (options.rotationDegrees) {
      console.log("Rotating the video...");
      const rotatedVideoPath = path.resolve(__dirname, "temp_rotated.mp4");
      await editYaw(tempVideoPath, rotatedVideoPath, options.rotationDegrees);
      tempVideoPath = rotatedVideoPath;
    }

    // Adjust color if specified in the options
    if (options.colorAdjustment) {
      console.log("Adjusting color of the video...");
      const colorAdjustedVideoPath = path.resolve(
        __dirname,
        "temp_color_adjusted.mp4"
      );
      await adjustColor(
        tempVideoPath,
        colorAdjustedVideoPath,
        options.colorAdjustment.brightness,
        options.colorAdjustment.contrast,
        options.colorAdjustment.saturation
      );
      tempVideoPath = colorAdjustedVideoPath;
    }

    // Process audio if an audio path is provided
    if (audioPath) {
      console.log("Processing audio...");
      videoDuration = videoDuration || (await getDuration(tempVideoPath));
      const audioCodec = getAudioCodec(audioPath);
      await processAudio(
        tempVideoPath,
        audioPath,
        finalVideoPath,
        videoDuration,
        audioCodec,
        options.overrideAudio || !videoHasAudio
      );
    } else if (tempVideoPath !== originalVideoPath) {
      // Copy the processed video to the final path if no new audio is added
      console.log("Copying the processed video to the final path...");
      await fs.copyFile(tempVideoPath, finalVideoPath);
    } else {
      console.log("No audio changes required. Process complete.");
    }
  } catch (error) {
    console.error(
      `An error occurred during video processing: ${error.message}`
    );
  } finally {
    // Cleanup: Delete all temporary files if they exist
    // Delete temporary files created during processing
    await deleteFileIfExists("temp_video.mp4");
    // Additional cleanup for other temporary files as per the options used
    if (options.pitchFactor) {
      await deleteFileIfExists(path.resolve(__dirname, "temp_pitched.mp4"));
    }
    if (options.rotationDegrees) {
      await deleteFileIfExists(path.resolve(__dirname, "temp_rotated.mp4"));
    }
    if (options.colorAdjustment) {
      await deleteFileIfExists(
        path.resolve(__dirname, "temp_color_adjusted.mp4")
      );
    }
  }
}

async function encodeForMP4AndSaveOnDirectory(
  videoPath,
  audioPath,
  outputDirectory,
  options = {}
) {
  videoPath = path.resolve(__dirname, videoPath);
  audioPath = audioPath ? path.resolve(__dirname, audioPath) : null;

  // Ensure the output directory exists
  outputDirectory = path.resolve(__dirname, outputDirectory);
  await ensureDirectoryExists(outputDirectory);

  // Determine the final video file path based on original file name
  const originalFileName = path.basename(videoPath, path.extname(videoPath));
  const finalVideoPath = path.join(outputDirectory, originalFileName + ".mp4");

  encodeForMP4AndSaveOnFile(videoPath, audioPath, finalVideoPath, options);
}

// Example usage
/*
const videoPath = "./item.webm";
const audioPath = "./sample-3s.mp3";
const finalVideoPath = "processed.mp4";
const options = {
  overrideAudio: false,
  pitchFactor: 1.2, // Example pitch factor
  rotationDegrees: 45, // Example rotation degrees
  colorAdjustment: {
    brightness: 0.3,
    contrast: 0.8,
    saturation: 1.0,
  },
};
*/

module.exports = { encodeForMP4AndSaveOnDirectory, encodeForMP4AndSaveOnFile };
