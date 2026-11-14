

export default async function handler(req, res) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";

  if (!["stage", "v1"].includes(env)) {
    return res.status(500).json({
      success: false,
      error: "Invalid SHOTSTACK_ENV"
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "SHOTSTACK_API_KEY is missing"
    });
  }

  const base = `https://api.shotstack.io/edit/${env}`;

  async function api(path, options = {}) {
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
        `Shotstack API error ${response.status}`
      );

      error.status = response.status;
      error.details = data;
      throw error;
    }

    return data;
  }

  function json(res, status, data) {
    return res.status(status).json(data);
  }

  function getCredits(data) {
    const value =
      data?.response?.credits ??
      data?.credits ??
      data?.response?.cost;

    return Number(value);
  }

  async function quoteAsset(asset, length) {
    const payload = { asset };

    if (typeof length === "number") {
      payload.length = length;
    }

    const data = await api("/generate/quote", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const credits = getCredits(data);

    if (!Number.isFinite(credits)) {
      throw new Error(
        "Could not read generation quote from Shotstack"
      );
    }

    return credits;
  }

  try {
    // 1. GET: CHECK MODELS OR RENDER STATUS

    if (req.method === "GET") {
      if (req.query?.models === "1") {
        const data = await api("/models?expand=options");

        return json(res, 200, {
          success: true,
          models: data.response || data
        });
      }

      const id = req.query?.id;

      if (!id) {
        return json(res, 400, {
          success: false,
          error: "Render ID is required"
        });
      }

      const data = await api(
        `/render/${encodeURIComponent(id)}`
      );

      const render = data?.response || {};

      return json(res, 200, {
        success: render.status !== "failed",
        renderId: render.id || id,
        status: render.status || "unknown",
        videoUrl:
          render.status === "done"
            ? render.url || null
            : null,
        downloadReady:
          render.status === "done" && Boolean(render.url),
        credits: render.credits ?? null,
        error:
          render.status === "failed"
            ? render.error || "Rendering failed"
            : null
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, {
        success: false,
        error: "Method not allowed"
      });
    }

    // 2. READ REQUEST

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const {
      mode = "test",
      product,
      script,
      imageUrl,
      audioUrl,
      voiceGender = "female",
      voice,
      videoStyle = "cinematic",
      music = false,
      maxCredits = 10,
      confirmCost = false
    } = body;

    if (!["quote", "test", "final"].includes(mode)) {
      return json(res, 400, {
        success: false,
        error: "Mode must be quote, test or final"
      });
    }

    const productName = String(product || "").trim();
    const scriptText = String(script || "").trim();

    if (!productName || !scriptText) {
      return json(res, 400, {
        success: false,
        error: "Product and script are required"
      });
    }

    if (scriptText.length > 2500) {
      return json(res, 400, {
        success: false,
        error: "Script is too long"
      });
    }

    if (mode === "test" && !imageUrl) {
      return json(res, 400, {
        success: false,
        error: "A public product image URL is required for test mode"
      });
    }

    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      return json(res, 400, {
        success: false,
        error: "Image URL must use HTTPS"
      });
    }

    if (audioUrl && !/^https:\/\//i.test(audioUrl)) {
      return json(res, 400, {
        success: false,
        error: "Audio URL must use HTTPS"
      });
    }

    // 3. SETTINGS

    const gender =
      voiceGender === "male" ? "male" : "female";

    const selectedVoice =
      voice ||
      (gender === "female" ? "Charlotte" : "Brian");

    const styles = {
      cinematic: `
        Photorealistic premium commercial.
        Natural professional human model.
        Dramatic cinematic lighting.
        Elegant camera movement.
        Detailed product close-ups.
      `,
      luxury: `
        Luxury fashion commercial.
        Elegant human model.
        Premium editorial lighting.
        Sophisticated camera movement.
      `,
      futuristic: `
        Futuristic premium commercial.
        Professional human model.
        Modern architectural setting.
        Dramatic cinematic lighting.
      `
    };

    const style =
      styles[videoStyle] || styles.cinematic;

    // 4. VOICE ASSET

    const voiceAsset = audioUrl
      ? {
          type: "audio",
          src: audioUrl
        }
      : {
          type: "audio",
          prompt: scriptText,
          model: "elevenlabs-multilingual-v2",
          options: {
            voice: selectedVoice,
            language: "en"
          }
        };

    // 5. MUSIC ASSET

    const musicAsset = {
      type: "audio",
      prompt: `
        Elegant cinematic advertising soundtrack.
        Modern uplifting instrumental music.
        No vocals.
      `,
      model: "elevenlabs-music",
      options: {
        forceInstrumental: true
      }
    };

    // 6. TEST MODE
    // No AI video generation.
    // Use an existing product image.

    if (mode === "test") {
      const duration = 12;

      const tracks = [
        // TOP TRACK: CAPTIONS
        {
          clips: [
            {
              asset: {
                type: "rich-caption",
                src: "alias://voiceover",
                font: {
                  family: "Roboto",
                  size: 38,
                  color: "#ffffff",
                  weight: 700
                },
                align: {
                  vertical: "bottom"
                },
                stroke: {
                  width: 3,
                  color: "#000000",
                  opacity: 1
                },
                animation: {
                  style: "highlight"
                }
              },
              start: 0,
              length: "end"
            }
          ]
        },

        // VOICE TRACK
        {
          clips: [
            {
              alias: "voiceover",
              asset: voiceAsset,
              start: 0,
              length: "auto"
            }
          ]
        },

        // IMAGE TRACK
        {
          clips: [
            {
              asset: {
                type: "image",
                src: imageUrl
              },
              start: 0,
              length: duration,
              fit: "crop",
              effect: "zoomIn"
            }
          ]
        }
      ];

      // TEST MODE NEVER GENERATES MUSIC.

      const edit = {
        timeline: {
          background: "#000000",
          tracks
        },
        output: {
          format: "mp4",
          size: {
            width: 540,
            height: 960
          },
          fps: 30
        }
      };

      const data = await api("/render", {
        method: "POST",
        body: JSON.stringify(edit)
      });

      const renderId = data?.response?.id;

      if (!renderId) {
        throw new Error("Test render ID was not returned");
      }

      return json(res, 200, {
        success: true,
        mode: "test",
        message: "Low-cost test rendering started",
        renderId,
        resolution: "540x960",
        aiVideoGeneration: false,
        aiVoice: !audioUrl,
        music: false,
        status: "queued",
        statusEndpoint: `?id=${encodeURIComponent(renderId)}`
      });
    }

    // 7. FINAL VIDEO ASSET

    const duration = 8;
    const resolution = "1080p";

    const model = imageUrl
      ? "gemini-omni-flash-1.1-image-to-video"
      : "gemini-omni-flash-1.1-text-to-video";

    const videoPrompt = `
      Create a premium photorealistic product advertisement.

      PRODUCT:
      ${productName}

      MODEL:
      ${gender === "female" ? "Professional female" : "Professional male"}
      commercial model with natural human expressions.

      STYLE:
      ${style}

      ACTION:
      Show the model naturally presenting the product.
      Use elegant camera movement.
      Include a cinematic product close-up.
      Make the product the visual focus.
      Keep the scene realistic and polished.

      QUALITY:
      Photorealistic commercial cinematography.
      Realistic skin and hands.
      Detailed materials.
      Professional studio lighting.

      IMPORTANT:
      No generated subtitles.
      No watermarks.
      No random logos.
      Keep the product recognizable.

      AD MESSAGE:
      ${scriptText.slice(0, 500)}
    `;

    const videoOptions = {
      resolution,
      aspectRatio: "9:16",
      generateAudio: false
    };

    if (imageUrl) {
      videoOptions.startSrc = imageUrl;
    }

    const videoAsset = {
      type: "video",
      prompt: videoPrompt,
      model,
      options: videoOptions
    };

    // 8. QUOTE BEFORE GENERATION

    const videoCredits = await quoteAsset(
      videoAsset,
      duration
    );

    const voiceCredits = audioUrl
      ? 0
      : await quoteAsset(voiceAsset);

    const musicCredits = music
      ? await quoteAsset(musicAsset, duration)
      : 0;

    // 8 SECONDS OF NORMAL RENDERING

    const renderCredits = duration / 60;

    const totalCredits =
      videoCredits +
      voiceCredits +
      musicCredits +
      renderCredits;

    const creditLimit = Math.max(
      0,
      Number(maxCredits) || 10
    );

    // QUOTE MODE DOES NOT SPEND CREDITS.

    if (mode === "quote") {
      return json(res, 200, {
        success: true,
        mode: "quote",
        message: "Cost estimate only. No credits charged.",
        breakdown: {
          video: Number(videoCredits.toFixed(4)),
          voice: Number(voiceCredits.toFixed(4)),
          music: Number(musicCredits.toFixed(4)),
          render: Number(renderCredits.toFixed(4))
        },
        estimatedTotalCredits:
          Number(totalCredits.toFixed(4)),
        maxCredits: creditLimit,
        withinCreditLimit: totalCredits <= creditLimit,
        videoModel: model,
        resolution: "1080x1920",
        durationSeconds: duration
      });
    }

    // 9. FINAL MODE REQUIRES USER APPROVAL.

    if (!confirmCost) {
      return json(res, 400, {
        success: false,
        error: "Final generation requires cost confirmation",
        estimatedTotalCredits:
          Number(totalCredits.toFixed(4))
      });
    }

    if (totalCredits > creditLimit) {
      return json(res, 402, {
        success: false,
        error: "Estimated cost exceeds your credit limit",
        estimatedTotalCredits:
          Number(totalCredits.toFixed(4)),
        maxCredits: creditLimit,
        message: "No final video was submitted."
      });
    }

    // 10. FINAL TIMELINE

    const finalTracks = [
      // TOP: AUTOMATIC CAPTIONS
      {
        clips: [
          {
            asset: {
              type: "rich-caption",
              src: "alias://voiceover",
              font: {
                family: "Roboto",
                size: 48,
                color: "#ffffff",
                weight: 700
              },
              align: {
                vertical: "bottom"
              },
              stroke: {
                width: 3,
                color: "#000000",
                opacity: 1
              },
              animation: {
                style: "highlight"
              },
              active: {
                font: {
                  background: "#690be9"
                }
              }
            },
            start: 0,
            length: "end"
          }
        ]
      },

      // VIDEO TRACK
      {
        clips: [
          {
            asset: videoAsset,
            start: 0,
            length: duration,
            fit: "crop"
          }
        ]
      },

      // VOICE TRACK
      {
        clips: [
          {
            alias: "voiceover",
            asset: voiceAsset,
            start: 0,
            length: "auto"
          }
        ]
      }
    ];

    // MUSIC IS OPTIONAL AND OFF BY DEFAULT.

    if (music) {
      finalTracks.push({
        clips: [
          {
            asset: musicAsset,
            start: 0,
            length: duration
          }
        ]
      });
    }

    const finalEdit = {
      timeline: {
        background: "#000000",
        tracks: finalTracks
      },
      output: {
        format: "mp4",
        size: {
          width: 1080,
          height: 1920
        },
        fps: 30
      }
    };

    // 11. SUBMIT FINAL RENDER

    const data = await api("/render", {
      method: "POST",
      body: JSON.stringify(finalEdit)
    });

    const renderId = data?.response?.id;

    if (!renderId) {
      throw new Error("Final render ID was not returned");
    }

    return json(res, 200, {
      success: true,
      mode: "final",
      message: "1080p cinematic rendering started",
      renderId,
      product: productName,
      resolution: "1080x1920",
      durationSeconds: duration,
      videoModel: model,
      estimatedCredits:
        Number(totalCredits.toFixed(4)),
      status: "queued",
      statusEndpoint: `?id=${encodeURIComponent(renderId)}`
    });

  } catch (error) {
    console.error(
      "SHOPPING SHORTS ERROR:",
      JSON.stringify(error.details || error.message, null, 2)
    );

    return json(res, error.status || 500, {
      success: false,
      error: error.message || "Video generation failed",
      details: error.details || null
    });
  }
}
