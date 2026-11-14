
export default async function handler(req, res) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";

  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "SHOTSTACK_API_KEY is missing"
    });
  }

  if (!["stage", "v1"].includes(env)) {
    return res.status(500).json({
      success: false,
      error: "Invalid SHOTSTACK_ENV"
    });
  }

  const base = `https://api.shotstack.io/edit/${env}`;

  async function shotstack(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": apiKey
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        data?.response?.message ||
        data?.message ||
        data?.error ||
        `Shotstack API error: ${response.status}`
      );

      error.status = response.status;
      error.details = data;
      throw error;
    }

    return data;
  }

  try {

    // 1. CHECK RENDER STATUS

    if (req.method === "GET") {
      const id = req.query?.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Render ID is required"
        });
      }

      const data = await shotstack(
        `/render/${encodeURIComponent(id)}`
      );

      const render = data?.response || {};

      return res.status(200).json({
        success: render.status !== "failed",
        renderId: render.id || id,
        status: render.status || "unknown",
        downloadReady:
          render.status === "done" && Boolean(render.url),
        videoUrl:
          render.status === "done" ? render.url : null,
        downloadUrl:
          render.status === "done" ? render.url : null,
        error:
          render.status === "failed"
            ? render.error || "Video rendering failed"
            : null
      });
    }

    // 2. RECEIVE REQUEST

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const {
      product,
      script,
      imageUrl,
      audioUrl,
      voiceGender = "female",
      voice,
      videoStyle = "cinematic",
      music = true
    } = body;

    if (!product || !script) {
      return res.status(400).json({
        success: false,
        error: "Product and script are required"
      });
    }

    const productName = String(product).trim();
    const scriptText = String(script).trim();

    if (!productName || !scriptText) {
      return res.status(400).json({
        success: false,
        error: "Product and script cannot be empty"
      });
    }

    if (scriptText.length > 2500) {
      return res.status(400).json({
        success: false,
        error: "Script is too long"
      });
    }

    if (
      imageUrl &&
      !/^https:\/\//i.test(imageUrl)
    ) {
      return res.status(400).json({
        success: false,
        error: "Image URL must use HTTPS"
      });
    }

    if (
      audioUrl &&
      !/^https:\/\//i.test(audioUrl)
    ) {
      return res.status(400).json({
        success: false,
        error: "Audio URL must use HTTPS"
      });
    }

    // 3. VOICE SETTINGS

    const gender =
      voiceGender === "male" ? "male" : "female";

    const selectedVoice =
      voice ||
      (gender === "female" ? "Charlotte" : "Brian");

    const useMusic = music !== false;

    const duration = 12;

    // 4. VIDEO STYLES

    const styles = {
      cinematic: `
        Premium Hollywood product commercial.
        Photorealistic professional human model.
        Dramatic cinematic lighting.
        Smooth professional camera movement.
        Natural human expressions.
        Luxury commercial cinematography.
      `,

      luxury: `
        Luxury fashion advertising.
        Elegant professional human model.
        Premium studio lighting.
        High-end editorial cinematography.
        Sophisticated natural movements.
      `,

      futuristic: `
        Futuristic technology commercial.
        Photorealistic human model.
        Modern architectural environment.
        Dramatic cinematic lighting.
        Premium futuristic atmosphere.
      `
    };

    const style =
      styles[videoStyle] || styles.cinematic;

    const modelDescription =
      gender === "female"
        ? "A photorealistic professional female commercial model"
        : "A photorealistic professional male commercial model";

    // 5. AI VIDEO PROMPT

    const videoPrompt = `
      Create a premium vertical 9:16 product advertisement.

      PRODUCT:
      ${productName}

      HUMAN MODEL:
      ${modelDescription}.

      VISUAL STYLE:
      ${style}

      STORY:
      Show the model naturally presenting and interacting
      with the product.

      Start with an impressive cinematic opening.
      Show the model in a professional environment.
      Move the camera toward a detailed product close-up.
      Finish with a memorable advertising shot.

      CAMERA:
      Smooth dolly movement.
      Cinematic tracking.
      Professional commercial framing.
      Natural human movement.

      QUALITY:
      Photorealistic.
      Detailed textures.
      Realistic lighting.
      Premium advertising production.

      IMPORTANT:
      Keep the product recognizable.
      Avoid distorted hands and faces.
      No subtitles, logos or watermarks.

      AD CONTEXT:
      ${scriptText.slice(0, 700)}
    `;

    // 6. AI VIDEO ASSET

    const videoAsset = {
      type: "video",
      prompt: videoPrompt,

      model: imageUrl
        ? "seedance-2.0-image-to-video"
        : "seedance-2.0-text-to-video",

      options: {
        resolution: "1080p",
        aspectRatio: "9:16",
        generateAudio: false,

        ...(imageUrl
          ? { startSrc: imageUrl }
          : {})
      }
    };

    // 7. AI VOICE ASSET
    // Volume belongs inside the audio asset.

    const voiceAsset = audioUrl
      ? {
          type: "audio",
          src: audioUrl,
          volume: 1
        }
      : {
          type: "audio",
          prompt: scriptText,
          model: "elevenlabs-multilingual-v2",
          options: {
            voice: selectedVoice,
            language: "en"
          },
          volume: 1
        };

    // 8. BACKGROUND MUSIC ASSET

    const musicAsset = {
      type: "audio",
      prompt: `
        Premium cinematic advertising soundtrack.
        Modern elegant electronic orchestration.
        Uplifting professional commercial atmosphere.
        Instrumental only.
        No vocals.
      `,
      model: "elevenlabs-music",
      options: {
        forceInstrumental: true
      },
      volume: 0.16,
      effect: "fadeInFadeOut"
    };

    // 9. BUILD TIMELINE
    // Video first, captions last.

    const tracks = [];

    // VIDEO TRACK

    tracks.push({
      clips: [
        {
          asset: videoAsset,
          start: 0,
          length: duration,
          fit: "crop"
        }
      ]
    });

    // BACKGROUND MUSIC TRACK

    if (useMusic) {
      tracks.push({
        clips: [
          {
            asset: musicAsset,
            start: 0,
            length: duration
          }
        ]
      });
    }

    // AI VOICE TRACK

    tracks.push({
      clips: [
        {
          alias: "voiceover",
          asset: voiceAsset,
          start: 0,
          length: "auto"
        }
      ]
    });

    // AUTOMATIC CAPTIONS TRACK

    tracks.push({
      clips: [
        {
          asset: {
            type: "rich-caption",
            src: "alias://voiceover",

            font: {
              family: "Roboto",
              size: 46,
              weight: "700",
              color: "#ffffff"
            },

            background: {
              color: "#000000",
              opacity: 0.55,
              borderRadius: 8,
              wrap: true,
              padding: 10
            },

            stroke: {
              width: 2,
              color: "#000000",
              opacity: 0.8
            },

            align: {
              horizontal: "center",
              vertical: "middle"
            },

            animation: {
              style: "highlight"
            }
          },

          start: 0,
          length: "end",
          position: "bottom"
        }
      ]
    });

    // 10. FULL HD OUTPUT

    const edit = {
      timeline: {
        background: "#000000",
        tracks
      },

      output: {
        format: "mp4",
        resolution: "1080",
        aspectRatio: "9:16",
        fps: 30,
        quality: "high"
      }
    };

    // 11. SUBMIT TO SHOTSTACK

    const data = await shotstack("/render", {
      method: "POST",
      body: JSON.stringify(edit)
    });

    const renderId = data?.response?.id;

    if (!renderId) {
      return res.status(502).json({
        success: false,
        error: "Shotstack did not return a render ID",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "AI Shopping Shorts rendering started",

      renderId,

      product: productName,

      video: {
        width: 1080,
        height: 1920,
        resolution: "1080x1920",
        aspectRatio: "9:16",
        fps: 30,
        format: "mp4"
      },

      ai: {
        humanModel: true,
        cinematicVideo: true,
        voice: selectedVoice,
        backgroundMusic: useMusic,
        automaticCaptions: true
      },

      status: "queued",

      statusEndpoint:
        `?id=${encodeURIComponent(renderId)}`
    });

  } catch (error) {

    console.error(
      "SHOTSTACK ERROR:",
      JSON.stringify(error.details, null, 2)
    );

    return res.status(error.status || 500).json({
      success: false,
      error: error.message,
      details: error.details || null
    });
  }
}
