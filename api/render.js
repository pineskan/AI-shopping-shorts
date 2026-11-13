
export default async function handler(req, res) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";

  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      error: "SHOTSTACK_API_KEY is missing"
    });
  }

  if (!["stage", "v1"].includes(env)) {
    return res.status(500).json({
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
    // =====================================
    // 1. CHECK VIDEO RENDER STATUS
    // =====================================

    if (req.method === "GET") {
      const id = req.query?.id;

      if (!id) {
        return res.status(400).json({
          error: "Render ID is required"
        });
      }

      const data = await shotstack(
        `/render/${encodeURIComponent(id)}`
      );

      return res.status(200).json(data);
    }

    // =====================================
    // 2. RECEIVE VIDEO REQUEST
    // =====================================

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
        error: "Product and script are required"
      });
    }

    if (String(script).length > 2500) {
      return res.status(400).json({
        error: "Script is too long. Maximum 2500 characters."
      });
    }

    if (
      imageUrl &&
      !/^https:\/\//i.test(imageUrl)
    ) {
      return res.status(400).json({
        error: "Image URL must use HTTPS"
      });
    }

    if (
      audioUrl &&
      !/^https:\/\//i.test(audioUrl)
    ) {
      return res.status(400).json({
        error: "Audio URL must use HTTPS"
      });
    }

    // =====================================
    // 3. AI MODEL AND CINEMATIC PROMPT
    // =====================================

    const productName = String(product).trim();

    const gender =
      voiceGender === "male" ? "male" : "female";

    const modelDescription =
      gender === "female"
        ? "A photorealistic professional female commercial model, elegant appearance, natural facial expressions, confident personality"
        : "A photorealistic professional male commercial model, elegant appearance, natural facial expressions, confident personality";

    const stylePrompts = {
      cinematic: `
        Premium Hollywood-style commercial,
        photorealistic human model,
        dramatic cinematic lighting,
        sophisticated camera movement,
        shallow depth of field,
        realistic skin texture,
        premium commercial production,
        beautiful composition,
        rich cinematic atmosphere.
      `,

      luxury: `
        Luxury fashion commercial,
        elegant professional human model,
        high-end studio lighting,
        premium editorial cinematography,
        sophisticated movements,
        refined visual atmosphere,
        photorealistic details.
      `,

      futuristic: `
        Futuristic technology commercial,
        photorealistic human model,
        modern architectural environment,
        dramatic lighting,
        sophisticated camera movement,
        premium science-fiction aesthetic,
        realistic product presentation.
      `
    };

    const selectedStyle =
      stylePrompts[videoStyle] ||
      stylePrompts.cinematic;

    const videoPrompt = `
      Create a premium vertical 9:16 product advertisement.

      PRODUCT: ${productName}

      HUMAN MODEL:
      ${modelDescription}

      VISUAL DIRECTION:
      ${selectedStyle}

      STORY:
      The human model naturally interacts with and presents
      the product in a professional commercial setting.

      Show an impressive opening shot,
      a cinematic medium shot of the model,
      a beautiful close-up of the product,
      and a memorable final advertising shot.

      CAMERA:
      Smooth dolly movement,
      cinematic tracking,
      controlled camera motion,
      professional commercial framing.

      QUALITY:
      Photorealistic,
      detailed textures,
      realistic lighting,
      premium advertising cinematography.

      IMPORTANT:
      Do not generate subtitles,
      captions, logos or random text.
      Keep the product recognizable.
      Avoid distorted hands and faces.

      ADVERTISING SCRIPT CONTEXT:
      ${String(script).slice(0, 1000)}
    `;

    // =====================================
    // 4. AI VIDEO ASSET
    // =====================================

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

    // =====================================
    // 5. AI ENGLISH VOICE
    // =====================================

    const selectedVoice =
      voice ||
      (gender === "female" ? "Charlotte" : "Brian");

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
            language: "en",
            stability: 0.48,
            similarityBoost: 0.78
          }
        };

    // =====================================
    // 6. CINEMATIC BACKGROUND MUSIC
    // =====================================

    const musicAsset = {
      type: "audio",
      prompt: `
        Premium cinematic advertising soundtrack,
        elegant modern electronic orchestration,
        uplifting atmosphere,
        sophisticated sound design,
        professional product commercial music,
        instrumental only,
        no vocals.
      `,
      model: "elevenlabs-music",
      options: {
        forceInstrumental: true
      }
    };

    // =====================================
    // 7. SPLIT SCRIPT FOR CAPTIONS
    // =====================================

    const sentences =
      String(script)
        .replace(/\s+/g, " ")
        .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [script];

    const groups = [[], [], [], []];

    sentences.forEach((sentence, index) => {
      const target = Math.min(
        3,
        Math.floor(index * 4 / sentences.length)
      );

      groups[target].push(sentence.trim());
    });

    const duration = 12;
    const sceneDuration = 3;

    const captionClips = groups
      .filter(group => group.length)
      .map((group, index) => ({
        asset: {
          type: "rich-text",
          text: group.join(" "),
          font: {
            family: "Montserrat",
            size: 48,
            weight: "700",
            color: "#ffffff"
          },
          align: {
            horizontal: "center",
            vertical: "middle"
          },
          background: {
            color: "#000000",
            opacity: 0.48
          }
        },
        start: index * sceneDuration,
        length: sceneDuration,
        position: "bottom",
        transition: {
          in: "fade",
          out: "fade"
        }
      }));

    // =====================================
    // 8. BUILD VIDEO TIMELINE
    // =====================================

    const tracks = [
      // AI VOICE
      {
        clips: [
          {
            asset: voiceAsset,
            start: 0,
            length: audioUrl ? "end" : "auto",
            volume: 1
          }
        ]
      },

      // CINEMATIC MUSIC
      ...(music
        ? [{
            clips: [
              {
                asset: musicAsset,
                start: 0,
                length: duration,
                volume: 0.16,
                effect: "fadeOut"
              }
            ]
          }]
        : []),

      // CAPTIONS
      {
        clips: captionClips
      },

      // AI GENERATED VIDEO
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

    // =====================================
    // 9. FULL HD VIDEO OUTPUT
    // =====================================

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
        quality: "high",
        scaleTo: "1080"
      }
    };

    // =====================================
    // 10. SUBMIT VIDEO TO SHOTSTACK
    // =====================================

    const data = await shotstack("/render", {
      method: "POST",
      body: JSON.stringify(edit)
    });

    const renderId = data?.response?.id;

    if (!renderId) {
      return res.status(502).json({
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
        captions: true
      },
      status: "queued"
    });

  } catch (error) {
    console.error("AI Shopping Shorts Error:", error);

    return res.status(error.status || 500).json({
      success: false,
      error: error.message || "Video rendering failed",
      details: error.details || undefined
    });
  }
}



    

     
     
