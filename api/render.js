

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
        "x-api-key": apiKey,
        ...(options.headers || {})
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
    // GET: Check render status
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

      return res.status(200).json(data);
    }

    // POST: Create video
    const {
      product,
      script,
      imageUrl,
      audioUrl,
      voiceGender = "female",
      voice,
      videoStyle = "cinematic",
      music = true
    } = req.body || {};

    if (!product || !script) {
      return res.status(400).json({
        success: false,
        error: "Product and script are required"
      });
    }

    if (String(script).length > 2500) {
      return res.status(400).json({
        success: false,
        error: "Script is too long. Maximum 2500 characters."
      });
    }

    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      return res.status(400).json({
        success: false,
        error: "Image URL must use HTTPS"
      });
    }

    if (audioUrl && !/^https:\/\//i.test(audioUrl)) {
      return res.status(400).json({
        success: false,
        error: "Audio URL must use HTTPS"
      });
    }

    const productName = String(product).trim();
    const gender = voiceGender === "male" ? "male" : "female";

    const selectedVoice =
      voice ||
      (gender === "female" ? "Charlotte" : "George");

    const styles = {
      cinematic: `
        Premium cinematic product commercial.
        Photorealistic professional human model.
        Dramatic studio lighting.
        Smooth camera movement.
        Natural expressions and realistic skin.
        Premium advertising cinematography.
      `,
      luxury: `
        Luxury fashion commercial.
        Elegant professional human model.
        High-end studio lighting.
        Sophisticated camera movement.
        Premium editorial atmosphere.
      `,
      futuristic: `
        Futuristic technology commercial.
        Photorealistic human model.
        Modern architectural environment.
        Dramatic cinematic lighting.
        Premium science-fiction atmosphere.
      `
    };

    const selectedStyle =
      styles[videoStyle] || styles.cinematic;

    const modelDescription =
      gender === "female"
        ? "A photorealistic professional female commercial model"
        : "A photorealistic professional male commercial model";

    const videoPrompt = `
      Create a premium product advertisement.

      PRODUCT: ${productName}

      MODEL:
      ${modelDescription}.

      STYLE:
      ${selectedStyle}

      ACTION:
      The model naturally presents and interacts with
      the product.

      Begin with an impressive cinematic opening.
      The camera moves smoothly toward the model.
      Cut to a detailed close-up of the product.
      Cut back to the model for a memorable final shot.

      Keep the product recognizable.
      Use realistic hands and facial expressions.
      Do not generate subtitles, captions, logos,
      watermarks or random text.

      Advertising context:
      ${String(script).slice(0, 700)}
    `;

    // AI video
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
        ...(imageUrl ? { startSrc: imageUrl } : {})
      }
    };

    // AI voice
    const voiceAsset = audioUrl
      ? {
          type: "audio",
          src: audioUrl
        }
      : {
          type: "audio",
          prompt: String(script),
          model: "elevenlabs-multilingual-v2",
          options: {
            voice: selectedVoice,
            language: "en"
          }
        };

    // Background music
    const musicAsset = {
      type: "audio",
      prompt: `
        Premium cinematic advertising soundtrack.
        Elegant modern electronic orchestration.
        Uplifting and sophisticated atmosphere.
        Instrumental only. No vocals.
      `,
      model: "elevenlabs-music",
      options: {
        forceInstrumental: true
      }
    };

    const duration = 15;

    // Tracks are layered from top to bottom.
    const tracks = [
      // Automatic captions synced to the voice
      {
        clips: [
          {
            asset: {
              type: "rich-caption",
              src: "alias://voice",
              font: {
                family: "Roboto",
                size: 46,
                weight: "700",
                color: "#ffffff"
              },
              background: {
                color: "#000000",
                opacity: 0.5,
                padding: 12,
                borderRadius: 10
              },
              align: {
                horizontal: "center",
                vertical: "middle"
              },
              animation: {
                style: "highlight",
                direction: "up"
              }
            },
            start: 0,
            length: "end",
            position: "bottom"
          }
        ]
      },

      // Background music
      ...(music
        ? [{
            clips: [
              {
                asset: musicAsset,
                start: 0,
                length: "end",
                volume: 0.16
              }
            ]
          }]
        : []),

      // AI voice
      {
        clips: [
          {
            alias: "voice",
            asset: voiceAsset,
            start: 0,
            length: "auto",
            volume: 1
          }
        ]
      },

      // AI cinematic video
      {
        clips: [
          {
            asset: videoAsset,
            start: 0,
            length: duration,
            fit: "crop"
          }
        ]
      }
    ];

    // Full HD vertical output
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

    // Submit render
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
      message: "AI Shopping Shorts 2.0 rendering started",
      renderId,
      product: productName,
      video: {
        resolution: "1080x1920",
        aspectRatio: "9:16",
        fps: 30,
        format: "mp4"
      },
      ai: {
        humanModel: true,
        cinematicVideo: true,
        voice: selectedVoice,
        backgroundMusic: Boolean(music),
        automaticCaptions: true
      },
      status: "queued"
    });

  } catch (error) {
    console.error("AI Shopping Shorts Error:", error);

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Video rendering failed",
      details: error.details || null
    });
  }
}
