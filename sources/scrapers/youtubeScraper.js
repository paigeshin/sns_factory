// https://chat.openai.com/c/c54293a0-0529-47fd-a505-a8e5a0f16aaf
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Function to ensure the existence of a directory before writing files to it.
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

// Function to scroll to the bottom of a dynamically loading page.
async function scrollToBottom(page) {
  let previousHeight;
  while (true) {
    previousHeight = await page.evaluate(
      "document.documentElement.scrollHeight"
    );
    await page.evaluate(
      "window.scrollTo(0, document.documentElement.scrollHeight)"
    );
    try {
      await page.waitForFunction(
        `document.documentElement.scrollHeight > ${previousHeight}`,
        { timeout: 3000 }
      );
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log("Scrolling finished.");
      break;
    }
  }
}

// Function to write data to a file.
async function writeToFile(filePath, data) {
  await ensureDirectoryExists(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// Function to scrape YouTube shorts from a given channel.
async function scrapeShorts(channel, outputDirectory) {
  const BASE_URL = "https://www.youtube.com";
  const browser = await puppeteer.launch({ headless: false });
  let details = [];

  try {
    const page = await browser.newPage();
    const url = `${BASE_URL}/${channel}/shorts`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle2" });

    await scrollToBottom(page);

    // Scraping details of each short video.
    details = await page.evaluate(() => {
      const videoElements = Array.from(
        document.querySelectorAll("#dismissible")
      );
      return videoElements
        .map((video) => {
          const views = video.querySelector("#metadata-line > span")?.innerText;
          const title = video.querySelector("#video-title")?.innerText;
          const url = video.querySelector("#details > h3 > a")?.href;

          return {
            title: title,
            description: "",
            views: views,
            uploadDate: "",
            url,
          };
        })
        .filter(Boolean);
    });

    console.log("Shorts details scraped, writing to file.");
    await writeToFile(
      path.resolve(__dirname, outputDirectory, `shorts_urls.json`),
      details.map((item) => item.url)
    );
    await writeToFile(
      path.resolve(__dirname, outputDirectory, `shorts_contents.json`),
      details
    );
  } catch (error) {
    console.error("Error fetching shorts: ", error);
  } finally {
    await browser.close();
  }

  return details;
}

// Function to scrape video details from a given channel.
async function scrapeVideos(channel, outputDirectory) {
  const BASE_URL = "https://www.youtube.com";
  const browser = await puppeteer.launch({ headless: false });

  const details = [];

  try {
    const page = await browser.newPage();
    const url = `${BASE_URL}/${channel}/videos`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle2" });

    await scrollToBottom(page);

    // Scraping URLs of each video.
    const urls = await page.evaluate(() => {
      const videoElements = Array.from(
        document.querySelectorAll("#video-title-link")
      );
      return videoElements.map((video) => video.href).filter(Boolean);
    });

    console.log("Scraping details for each video.");
    for (const url of urls) {
      const detail = await scrapeVideoDetails(page, url);
      console.log(`Details for ${url} scraped.`);
      details.push(detail);
    }

    console.log("Video details scraped, writing to file.");
    await writeToFile(
      path.resolve(__dirname, outputDirectory, `videos_urls.json`),
      details.map((item) => item.url)
    );
    await writeToFile(
      path.resolve(__dirname, outputDirectory, `videos_contents.json`),
      details
    );
  } catch (error) {
    console.error("Error fetching videos: ", error);
  } finally {
    await browser.close();
  }

  return details;
}

// Function to scrape individual video details.
async function scrapeVideoDetails(page, url) {
  try {
    console.log(`Scraping details from ${url}`);
    await page.goto(url, { waitUntil: "networkidle2" });

    await page.waitForSelector("#title > h1 > yt-formatted-string", {
      timeout: 5000,
    });

    const details = await page.evaluate((url) => {
      const titleSelector = "#title > h1 > yt-formatted-string";
      const descriptionSelector = "#attributed-snippet-text > span > span";
      const viewsSelector = "#info > span:nth-child(1)";
      const uploadDateSelector = "#info > span:nth-child(3)";

      const title = document.querySelector(titleSelector)?.innerText;
      const description =
        document.querySelector(descriptionSelector)?.innerText;
      const views = document.querySelector(viewsSelector)?.innerText;
      const uploadDate = document.querySelector(uploadDateSelector)?.innerText;

      return {
        title: title,
        description: description,
        views: views,
        uploadDate: uploadDate,
        url,
      };
    }, url);

    return details;
  } catch (error) {
    console.error(`Error scraping video details from ${url}: `, error);
    return null; // Indicates failure to scrape details
  }
}

// Example usage
// scrapeShorts("@channelName", "path/to/output/directory/for/shorts");
// scrapeVideos("@channelName", "path/to/output/directory/for/videos");

module.exports = {
  scrapeShorts,
  scrapeVideos,
};
