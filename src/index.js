const axios = require("axios");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const FormData = require("form-data");
const { Configuration, OpenAIApi } = require("openai");

require("dotenv").config();

const openaiApiKey = process.env.OPENAI_API_KEY;
const token = process.env.TELEGRAM_BOT_TOKEN;

const configuration = new Configuration({
  apiKey: openaiApiKey,
});
const openai = new OpenAIApi(configuration);

// Set the path to the FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegPath);

// Replace with your own Telegram bot token

// Create a new Telegram bot instance
const bot = new TelegramBot(token, { polling: true });

// Function to convert the audio to a format compatible with the ASR system (e.g., mp3)
async function convertAudioToMp3(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .outputFormat("mp3")
      .on("error", (err) => {
        console.error(`Error: ${err.message}`);
        reject(err);
      })
      .on("end", () => {
        console.log("Conversion completed");
        resolve(outputFile);
      })
      .saveToFile(outputFile);
  });
}

// Placeholder function for sending an audio file to the hypothetical Whisper API for transcription
async function transcribeAudioWithWhisper(audioFile) {
  try {
    // Read the audio file into a Buffer
    const audioStream = fs.createReadStream(audioFile);

    // Create a FormData instance and append the audio file
    const formData = new FormData();
    formData.append("file", audioStream, { filename: audioFile });
    formData.append("model", "whisper-1");

    // Set the appropriate headers and make a POST request with Axios
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${openaiApiKey}`,
        },
      }
    );

    // Handle the response
    return response.data;
  } catch (error) {
    console.error(
      "Error sending audio file:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function handleAudio(chatId, fileId, fileName) {
  bot.sendMessage(chatId, `Hoi! Transcriptie is bezig...`);
  const ext = fileName.split(".").pop();
  const localFile = `${fileId}.${ext}`;
  let mp3File;

  try {
    // Download the audio file
    const fileLink = await bot.getFileLink(fileId);
    const response = await axios.get(fileLink, { responseType: "arraybuffer" });
    fs.writeFileSync(localFile, Buffer.from(response.data));

    // Convert the audio file to mp3 if it's an Opus file
    mp3File = localFile.endsWith(".opus") ? `${fileId}.mp3` : localFile;

    if (localFile !== mp3File) {
      await convertAudioToMp3(localFile, mp3File);
    }

    const transcription = await transcribeAudioWithWhisper(mp3File);

    bot.sendMessage(chatId, `Transcriptie: ${transcription.text}`);

    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Summarize the following text, in dutch: "${transcription.text}"`,
        },
      ],
    });

    bot.sendMessage(
      chatId,
      `Samenvatting: ${completion.data.choices[0].message.content}`
    );
  } catch (err) {
    console.error("Error during transcription:", err);
    bot.sendMessage(chatId, "An error occurred while transcribing the audio.");
  } finally {
    fs.rmSync(localFile);
    fs.rmSync(mp3File);
  }
}

bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const documentId = msg.document.file_id;
  const fileName = msg.document.file_name;
  await handleAudio(chatId, documentId, fileName);
});

bot.on("audio", async (msg) => {
  const chatId = msg.chat.id;
  const audioId = msg.audio.file_id;
  const fileName = `${audioId}.${msg.audio.mime_type.split("/").pop()}`;
  await handleAudio(chatId, audioId, fileName);
});

console.log("Telegram bot is running");
