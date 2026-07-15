/**
 * OpenAI Whisper Transcription Service
 * 
 * Downloads audio recordings from Twilio, sends to OpenAI Whisper API,
 * cleans up transcription, and triggers order creation.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { env } = require("../../src/config/env");

const openai = new OpenAI({
  apiKey: env.openai.apiKey
});

const TRANSCRIPTION_CACHE_DIR = path.join(__dirname, "../../.cache/transcriptions");

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!fs.existsSync(TRANSCRIPTION_CACHE_DIR)) {
    fs.mkdirSync(TRANSCRIPTION_CACHE_DIR, { recursive: true });
  }
}

/**
 * Download audio file from URL
 * @param {string} url - URL to download from (Twilio recording URL)
 * @param {string} outputPath - Local file path to save to
 * @returns {Promise<void>}
 */
async function downloadAudioFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    https.get(url, (response) => {
      response.pipe(file);

      file.on("finish", () => {
        file.close(() => resolve());
      });

      file.on("error", (err) => {
        fs.unlink(outputPath, () => {}); // Clean up on error
        reject(err);
      });
    }).on("error", (err) => {
      fs.unlink(outputPath, () => {}); // Clean up on error
      reject(err);
    });
  });
}

/**
 * Transcribe audio file using OpenAI Whisper
 * @param {string} audioPath - Path to audio file
 * @param {string} recordingSid - Twilio recording SID for caching
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(audioPath, recordingSid) {
  try {
    if (!env.openai.apiKey) {
      console.warn("OpenAI API key not configured. Using fallback transcription.");
      return "Transcription not available (OpenAI API key missing)";
    }

    console.log("Sending audio to Whisper API:", { audioPath, recordingSid });

    const audioStream = fs.createReadStream(audioPath);

    const transcript = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-1",
      language: "en",
      response_format: "text"
    });

    console.log("Whisper transcription completed:", {
      recordingSid,
      transcriptionLength: transcript.length
    });

    return transcript;
  } catch (error) {
    console.error("Error transcribing audio with Whisper:", error);
    throw error;
  }
}

/**
 * Clean up and normalize transcription text
 * @param {string} transcript - Raw transcription from Whisper
 * @returns {string} Cleaned transcript
 */
function cleanupTranscript(transcript) {
  if (!transcript) return "";

  let cleaned = transcript;

  // Remove common filler words
  const fillerPatterns = [
    /\b(um|uh|ummm|ah|ahh|like|you know|basically|sort of|kind of)\b/gi,
    /\s+/g // Normalize whitespace
  ];

  fillerPatterns.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, pattern.source === "\\s+" ? " " : "");
  });

  // Normalize common acronyms and abbreviations
  cleaned = cleaned.replace(/\bUSA\b/g, "United States");
  cleaned = cleaned.replace(/\bUK\b/g, "United Kingdom");

  // Capitalize first letter of sentences
  cleaned = cleaned.replace(/([.!?]\s*|\b)([a-z])/g, (match, p1, p2) => {
    return p1 + p2.toUpperCase();
  });

  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Process recording from Twilio
 * @param {Object} recordingData - Recording metadata (url, recordingSid, etc.)
 * @param {Function} onTranscriptionComplete - Callback with cleaned transcript
 * @returns {Promise<Object>} Transcription result
 */
async function processRecording(recordingData, onTranscriptionComplete) {
  const { recordingUrl, recordingSid, callSid, callerPhone, timestamp } = recordingData;

  try {
    ensureCacheDir();

    // Check if already transcribed (cache)
    const cachedPath = path.join(TRANSCRIPTION_CACHE_DIR, `${recordingSid}.json`);
    if (fs.existsSync(cachedPath)) {
      console.log("Using cached transcription:", recordingSid);
      const cached = JSON.parse(fs.readFileSync(cachedPath, "utf8"));
      if (onTranscriptionComplete) {
        await onTranscriptionComplete(cached);
      }
      return cached;
    }

    // Download audio file from Twilio
    console.log("Downloading audio file:", recordingUrl);
    const audioPath = path.join(TRANSCRIPTION_CACHE_DIR, `${recordingSid}.wav`);
    await downloadAudioFile(recordingUrl, audioPath);

    // Transcribe using Whisper
    console.log("Transcribing audio with Whisper...");
    const rawTranscript = await transcribeAudio(audioPath, recordingSid);

    // Clean up transcript
    const cleanedTranscript = cleanupTranscript(rawTranscript);

    // Prepare result
    const result = {
      recordingSid,
      callSid,
      callerPhone,
      rawTranscript,
      cleanedTranscript,
      timestamp: new Date().toISOString(),
      processingTimestamp: timestamp,
      status: "transcribed",
      source: "twilio_voice"
    };

    // Cache the result
    fs.writeFileSync(cachedPath, JSON.stringify(result, null, 2));

    // Clean up audio file
    fs.unlink(audioPath, (err) => {
      if (err) console.error("Error deleting audio file:", err);
    });

    // Call the callback
    if (onTranscriptionComplete) {
      await onTranscriptionComplete(result);
    }

    console.log("Transcription processing completed:", {
      recordingSid,
      cleanedLength: cleanedTranscript.length
    });

    return result;
  } catch (error) {
    console.error("Error processing recording:", error);
    throw error;
  }
}

/**
 * Batch process multiple recordings to reduce API costs
 * @param {Array<Object>} recordingsList - Array of recording data objects
 * @param {Function} onBatchComplete - Callback when batch is processed
 * @returns {Promise<void>}
 */
async function batchProcessRecordings(recordingsList, onBatchComplete) {
  console.log(`Starting batch transcription of ${recordingsList.length} recordings`);

  const results = [];

  for (const recordingData of recordingsList) {
    try {
      const result = await processRecording(recordingData);
      results.push(result);
    } catch (error) {
      console.error(`Error processing recording ${recordingData.recordingSid}:`, error);
      results.push({
        recordingSid: recordingData.recordingSid,
        status: "failed",
        error: error.message
      });
    }
  }

  if (onBatchComplete) {
    await onBatchComplete(results);
  }

  return results;
}

/**
 * Get transcription from cache if available
 * @param {string} recordingSid - Twilio recording SID
 * @returns {Object|null} Cached transcription or null
 */
function getFromCache(recordingSid) {
  ensureCacheDir();
  const cachedPath = path.join(TRANSCRIPTION_CACHE_DIR, `${recordingSid}.json`);

  if (fs.existsSync(cachedPath)) {
    return JSON.parse(fs.readFileSync(cachedPath, "utf8"));
  }

  return null;
}

module.exports = {
  processRecording,
  batchProcessRecordings,
  transcribeAudio,
  cleanupTranscript,
  downloadAudioFile,
  getFromCache,
  ensureCacheDir
};
