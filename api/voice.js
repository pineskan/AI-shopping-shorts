

// api/voice.js
// AI Shopping Shorts 3.0
// OpenAI text-to-speech -> downloadable MP3 for CapCut

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST method required."
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is missing in Vercel."
      });
    }

    const body = req.body || {};
    const script = String(body.script || "").trim();
    const selectedVoice = body.voice === "male" ? "onyx" : "coral";

    if (!script) {
      return res.status(400).json({
        success: false,
        error: "Advertisement script is required."
      });
    }

    if (script.length > 1800) {
      return res.status(400).json({
        success: false,
        error: "Script is too long. Please keep it under 1800 characters."
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: selectedVoice,
          input: script,
          instructions:
            "Speak in natural American English. " +
            "Use a warm, confident, friendly commercial advertising tone. " +
            "Sound like a real professional presenter. " +
            "Use clear pronunciation, natural pauses and expressive delivery.",
          response_format: "mp3"
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      let message = errorText;

      try {
        const parsed = JSON.parse(errorText);
        message = parsed.error?.message || errorText;
      } catch {}

      throw new Error(
        `OpenAI voice error (${response.status}): ${message.slice(0, 500)}`
      );
    }

    const audioBuffer = Buffer.from(
      await response.arrayBuffer()
    );

    if (!audioBuffer.length) {
      throw new Error("OpenAI returned an empty audio file.");
    }

    return res.status(200).json({
      success: true,
      voice: selectedVoice,
      format: "mp3",
      mimeType: "audio/mpeg",
      fileName: "AI-Shopping-Shorts-Voice.mp3",
      audioBase64: audioBuffer.toString("base64")
    });

  } catch (error) {
    console.error("VOICE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Voice generation failed."
    });
  }
}
