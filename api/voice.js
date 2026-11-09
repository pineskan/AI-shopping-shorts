
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

  const ingestBase =
    `https://api.shotstack.io/ingest/${env}`;

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

    // STEP 1: Generate MP3 with OpenAI

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

    // STEP 2: Request Shotstack upload URL

    const uploadResponse = await fetch(
      `${ingestBase}/upload`,
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
        JSON.stringify(uploadData)
      );
    }

    const uploadId = uploadData.data?.id;

    const signedUrl =
      uploadData.data?.attributes?.url;

    if (!uploadId || !signedUrl) {
      throw new Error(
        "Shotstack upload ID or signed URL missing"
      );
    }

    // STEP 3: Upload MP3 using FULL signed URL

    const putResponse = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "audio/mpeg"
      },
      body: audioBuffer
    });

    if (!putResponse.ok) {
      const error = await putResponse.text();

      throw new Error(
        "Shotstack MP3 upload failed: " + error
      );
    }

    // STEP 4: Wait until source is ready

    let audioUrl = null;
    let sourceStatus = "";

    for (let i = 0; i < 30; i++) {

      await new Promise(resolve =>
        setTimeout(resolve, 2000)
      );

      const sourceResponse = await fetch(
        `${ingestBase}/sources/${encodeURIComponent(uploadId)}`,
        {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "x-api-key": shotstackKey
          }
        }
      );

      const sourceData = await sourceResponse.json();

      if (!sourceResponse.ok) {
        throw new Error(
          "Cannot check Shotstack source: " +
          JSON.stringify(sourceData)
        );
      }

      const attributes =
        sourceData.data?.attributes || {};

      sourceStatus = attributes.status || "";

      if (sourceStatus === "ready") {

        audioUrl = attributes.source;

        if (!audioUrl) {
          throw new Error(
            "Source is ready but audio URL is missing"
          );
        }

        break;
      }

      if (sourceStatus === "failed") {
        throw new Error(
          "Shotstack audio ingestion failed"
        );
      }
    }

    if (!audioUrl) {
      throw new Error(
        "Audio upload timed out. Last status: " +
        sourceStatus
      );
    }

    // STEP 5: Return usable audio URL

    return res.status(200).json({
      success: true,
      audioUrl,
      voice: selectedVoice,
      status: "ready"
    });

  } catch (error) {

    console.error(
      "Voice generation error:",
      error
    );

    return res.status(500).json({
      error: error.message || "Voice generation failed"
    });
  }
}
