
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const shotstackKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";

  if (!openaiKey || !shotstackKey) {
    return res.status(500).json({
      error: "API keys are missing"
    });
  }

  if (!["stage", "v1"].includes(env)) {
    return res.status(500).json({
      error: "Invalid SHOTSTACK_ENV"
    });
  }

  try {
    const { script, voice } = req.body || {};

    if (!script || typeof script !== "string") {
      return res.status(400).json({
        error: "Advertisement script is required"
      });
    }

    if (script.length > 4000) {
      return res.status(400).json({
        error: "Script is too long"
      });
    }

    const selectedVoice =
      voice === "male" ? "onyx" : "coral";

    // 1. Generate MP3 with OpenAI
    const speechResponse = await fetch(
      "https://api.openai.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: selectedVoice,
          input: script,
          instructions:
            "Speak in natural American English with a clear, friendly commercial advertising tone.",
          response_format: "mp3"
        })
      }
    );

    if (!speechResponse.ok) {
      const error = await speechResponse.text();
      throw new Error("OpenAI voice error: " + error);
    }

    const audioBuffer = Buffer.from(
      await speechResponse.arrayBuffer()
    );

    // 2. Request Shotstack upload URL
    const uploadResponse = await fetch(
      `https://api.shotstack.io/ingest/${env}/upload`,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "x-api-key": shotstackKey
        }
      }
    );

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(
        uploadData.message || "Shotstack upload request failed"
      );
    }

    const signedUrl =
      uploadData.data?.attributes?.url;

    if (!signedUrl) {
      throw new Error("Upload URL was not returned");
    }

    // 3. Upload MP3 to Shotstack
    const putResponse = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "audio/mpeg"
      },
      body: audioBuffer
    });

    if (!putResponse.ok) {
      throw new Error("MP3 upload failed");
    }

    // 4. Return public source URL
    const audioUrl = signedUrl.split("?")[0];

    return res.status(200).json({
      success: true,
      audioUrl,
      voice: selectedVoice
    });

  } catch (error) {
    console.error("Voice generation error:", error);

    return res.status(500).json({
      error: error.message
    });
  }
}
