
// api/render.js
// AI Shopping Shorts 2.0
// Low-cost mode: Seedance 2.0 / 480p / 5 scenes / 20 seconds

const API_KEY = process.env.SHOTSTACK_API_KEY;
const ENV = process.env.SHOTSTACK_ENV || "stage";
const BASE_URL = `https://api.shotstack.io/edit/${ENV}`;

const VIDEO_MODEL = "seedance-2.0-text-to-video";
const IMAGE_VIDEO_MODEL = "seedance-2.0-image-to-video";
const SPEECH_MODEL = "elevenlabs-multilingual-v2";
const MUSIC_MODEL = "elevenlabs-music";

const VIDEO_RESOLUTION = "480p";
const ASPECT_RATIO = "9:16";
const SCENE_LENGTH = 4;
const SCENE_COUNT = 5;
const TOTAL_LENGTH = SCENE_LENGTH * SCENE_COUNT;
const MAX_CREDITS_DEFAULT = 30;

// Approximate editing charge from the previous account quote.
// AI video, speech and music are quoted separately through Shotstack.
const EDITING_ESTIMATE = TOTAL_LENGTH / 60;

const VOICES = [
  "Charlotte", "George", "Rachel", "Aria",
  "Roger", "Brian", "Sarah", "Liam"
];

function json(res, status, data) {
  return res.status(status).json(data);
}

function safeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function validHttpsUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function getProduct(body) {
  const product = body.product || {};

  return {
    name: cleanText(product.name, 180),
    price: cleanText(product.price, 60),
    store: cleanText(product.store, 100),
    imageUrl: cleanText(product.imageUrl, 1500),
    productUrl: cleanText(product.productUrl, 1500)
  };
}

function buildScenePrompts(product, style) {
  const name = product.name || "the featured product";
  const store = product.store || "premium retail";
  const productDescription =
    `${name}, a real consumer product, recognizable packaging and accurate product appearance`;

  const styleDescriptions = {
    cinematic:
      "luxury cinematic commercial, premium film lighting, rich contrast, elegant camera movement",
    energetic:
      "energetic social media commercial, dynamic camera movement, bright modern lighting",
    minimal:
      "minimal premium product advertisement, clean studio lighting, refined composition",
    lifestyle:
      "authentic lifestyle influencer commercial, natural daylight, warm relatable atmosphere"
  };

  const look = styleDescriptions[style] || styleDescriptions.cinematic;

  const modelDescription =
    "One adult female commercial model, approximately 25 to 35 years old, " +
    "natural realistic human appearance, expressive eyes, believable skin texture, " +
    "professional but approachable, modern American lifestyle advertising. " +
    "Keep the same general model identity and styling throughout this commercial.";

  return [
    `${look}. Opening hero shot. ${modelDescription} ` +
    `She introduces ${productDescription} in a beautiful modern studio. ` +
    `The product is clearly visible in her hands. Slow cinematic camera push-in. ` +
    `Photorealistic live-action commercial, natural human movement.`,

    `${look}. Product beauty shot. ` +
    `${productDescription} displayed prominently on a premium surface. ` +
    `The adult model's hands gently pick up and present the product. ` +
    `Slow elegant camera orbit, realistic reflections, detailed packaging, ` +
    `shallow depth of field, professional commercial photography.`,

    `${look}. Lifestyle demonstration. ${modelDescription} ` +
    `She naturally uses or demonstrates ${productDescription} in a beautiful real-life setting. ` +
    `Believable hand movement, authentic expression, smooth camera tracking, ` +
    `premium American product advertisement.`,

    `${look}. Close-up detail shot of ${productDescription}. ` +
    `The model smiles naturally in the softly blurred background. ` +
    `Focus on the product's design and visual details, cinematic macro camera movement, ` +
    `realistic skin and materials, polished commercial lighting.`,

    `${look}. Final campaign hero shot. ${modelDescription} ` +
    `She confidently presents ${productDescription} toward the camera. ` +
    `The product is centered and clearly visible. Elegant slow camera pull-back, ` +
    `beautiful premium advertising finish, clean composition with room for a call to action.`
  ];
}

function buildVideoAsset(prompt, imageUrl, index) {
  // The first scene can animate the real product image.
  // The remaining four scenes use text-to-video prompts.
  if (index === 0 && validHttpsUrl(imageUrl)) {
    return {
      type: "video",
      model: IMAGE_VIDEO_MODEL,
      prompt:
        "Animate this product image into a cinematic commercial shot. " +
        "Keep the product packaging and design recognizable. " +
        "A realistic adult model's hands gently present the product. " +
        "Slow camera push-in, premium lighting, natural motion.",
      options: {
        startSrc: imageUrl,
        aspectRatio: ASPECT_RATIO,
        resolution: VIDEO_RESOLUTION,
        generateAudio: false
      }
    };
  }

  return {
    type: "video",
    model: VIDEO_MODEL,
    prompt,
    options: {
      aspectRatio: ASPECT_RATIO,
      resolution: VIDEO_RESOLUTION,
      generateAudio: false
    }
  };
}

async function shotstackRequest(path, method = "GET", body) {
  if (!API_KEY) {
    throw new Error("SHOTSTACK_API_KEY is missing in Vercel Environment Variables.");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Shotstack returned an invalid response (${response.status}): ${text.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    const message =
      data.error ||
      data.message ||
      data.response?.error ||
      `Shotstack request failed (${response.status})`;

    throw new Error(message);
  }

  return data;
}

async function quoteAsset(asset, length) {
  const body = { asset };

  if (length !== undefined && length !== null) {
    body.length = length;
  }

  const data = await shotstackRequest(
    "/generate/quote",
    "POST",
    body
  );

  const credits = safeNumber(
    data.credits ?? data.response?.credits,
    NaN
  );

  if (!Number.isFinite(credits)) {
    throw new Error("Shotstack quote response did not include a valid credit amount.");
  }

  return credits;
}

async function calculateQuote(body) {
  const product = getProduct(body);
  const script = cleanText(body.script, 5000);
  const voice = VOICES.includes(body.voice) ? body.voice : "Charlotte";
  const style = cleanText(body.style, 40) || "cinematic";

  if (!product.name) {
    throw new Error("Product name is required.");
  }

  if (!script) {
    throw new Error("English advertisement script is required.");
  }

  if (product.imageUrl && !validHttpsUrl(product.imageUrl)) {
    throw new Error("Product image URL must be a public HTTPS URL.");
  }

  const prompts = buildScenePrompts(product, style);

  let videoCredits = 0;

  // Quote each scene separately so the total is based on five actual requests.
  for (let i = 0; i < SCENE_COUNT; i++) {
    const asset = buildVideoAsset(
      prompts[i],
      product.imageUrl,
      i
    );

    videoCredits += await quoteAsset(asset, SCENE_LENGTH);
  }

  const speechAsset = {
    type: "audio",
    prompt: script,
    model: SPEECH_MODEL,
    options: {
      voice,
      language: "en",
      stability: 0.48,
      similarityBoost: 0.78,
      style: 0.25
    }
  };

  const voiceCredits = await quoteAsset(speechAsset);

  const musicAsset = {
    type: "audio",
    prompt:
      "Premium upbeat instrumental commercial background music, " +
      "modern elegant electronic pop, warm uplifting energy, " +
      "subtle cinematic build, no vocals, no lyrics.",
    model: MUSIC_MODEL,
    options: {
      forceInstrumental: true
    }
  };

  const musicCredits = await quoteAsset(musicAsset, TOTAL_LENGTH);

  const breakdown = {
    video: videoCredits,
    voice: voiceCredits,
    music: musicCredits,
    editing: EDITING_ESTIMATE
  };

  const total =
    breakdown.video +
    breakdown.voice +
    breakdown.music +
    breakdown.editing;

  const maxCredits = Math.min(
    30,
    Math.max(1, safeNumber(body.maxCredits, MAX_CREDITS_DEFAULT))
  );

  return {
    product,
    script,
    voice,
    style,
    prompts,
    breakdown,
    estimatedTotalCredits: Number(total.toFixed(3)),
    maxCredits,
    withinLimit: total <= maxCredits,
    resolution: VIDEO_RESOLUTION,
    outputSize: "480x854",
    aspectRatio: ASPECT_RATIO,
    durationSeconds: TOTAL_LENGTH,
    sceneCount: SCENE_COUNT
  };
}

function buildEdit(quote) {
  const product = quote.product;
  const script = quote.script;
  const prompts = quote.prompts;

  const videoClips = [];

  for (let i = 0; i < SCENE_COUNT; i++) {
    videoClips.push({
      asset: buildVideoAsset(
        prompts[i],
        product.imageUrl,
        i
      ),
      start: i * SCENE_LENGTH,
      length: SCENE_LENGTH,
      effect: i === 0 ? "zoomIn" : "none",
      transition: {
        in: "fade",
        out: "fade"
      }
    });
  }

  const speechClip = {
    alias: "narrator",
    asset: {
      type: "audio",
      prompt: script,
      model: SPEECH_MODEL,
      options: {
        voice: quote.voice,
        language: "en",
        stability: 0.48,
        similarityBoost: 0.78,
        style: 0.25
      }
    },
    start: 0,
    length: "auto"
  };

  const captionClip = {
    asset: {
      type: "rich-caption",
      src: "alias://narrator",
      font: {
        family: "Arial",
        size: 30,
        weight: "700",
        color: "#ffffff"
      },
      stroke: {
        width: 2,
        color: "#000000",
        opacity: 0.9
      },
      shadow: {
        offsetX: 1,
        offsetY: 2,
        blur: 4,
        color: "#000000",
        opacity: 0.8
      },
      background: {
        color: "#101010",
        opacity: 0.35
      },
      position: "bottom"
    },
    start: 0,
    length: "end"
  };

  const titleClip = {
    asset: {
      type: "rich-text",
      text: product.name,
      font: {
        family: "Arial",
        size: 28,
        weight: "700",
        color: "#ffffff"
      },
      background: {
        color: "#111827",
        opacity: 0.72
      },
      alignment: {
        horizontal: "center",
        vertical: "center"
      },
      width: 430,
      height: 90
    },
    start: 0,
    length: 3,
    position: "top"
  };

  const priceText = product.price
    ? `SHOP NOW · ${product.price}`
    : "SHOP NOW";

  const ctaClip = {
    asset: {
      type: "rich-text",
      text: priceText,
      font: {
        family: "Arial",
        size: 30,
        weight: "700",
        color: "#ffffff"
      },
      background: {
        color: "#6658dc",
        opacity: 0.95
      },
      alignment: {
        horizontal: "center",
        vertical: "center"
      },
      width: 420,
      height: 90
    },
    start: 16,
    length: 4,
    position: "bottom"
  };

  const musicClip = {
    asset: {
      type: "audio",
      prompt:
        "Premium upbeat instrumental commercial background music, " +
        "modern elegant electronic pop, warm uplifting energy, " +
        "subtle cinematic build, no vocals, no lyrics.",
      model: MUSIC_MODEL,
      options: {
        forceInstrumental: true
      }
    },
    start: 0,
    length: TOTAL_LENGTH,
    volume: 0.16
  };

  return {
    timeline: {
      background: "#080d18",
      tracks: [
        { clips: [captionClip] },
        { clips: [titleClip, ctaClip] },
        { clips: [speechClip] },
        { clips: [musicClip] },
        { clips: videoClips }
      ]
    },
    output: {
      format: "mp4",
      size: {
        width: 480,
        height: 854
      },
      fps: 24,
      quality: "high"
    }
  };
}

function extractRenderId(data) {
  return (
    data.response?.id ||
    data.id ||
    data.renderId ||
    null
  );
}

export default async function handler(req, res) {
  try {
    if (!["stage", "v1"].includes(ENV)) {
      return json(res, 500, {
        success: false,
        error: "SHOTSTACK_ENV must be either stage or v1."
      });
    }

    if (!API_KEY) {
      return json(res, 500, {
        success: false,
        error: "SHOTSTACK_API_KEY is missing."
      });
    }

    // GET: Check render status or list available models.
    if (req.method === "GET") {
      if (req.query?.models === "1") {
        const data = await shotstackRequest(
          "/models?expand=options"
        );

        return json(res, 200, data);
      }

      const renderId = cleanText(req.query?.id, 150);

      if (!renderId) {
        return json(res, 400, {
          success: false,
          error: "Render ID is required."
        });
      }

      const data = await shotstackRequest(
        `/render/${encodeURIComponent(renderId)}?data=false`
      );

      return json(res, 200, data);
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, {
        success: false,
        error: "Method not allowed."
      });
    }

    const body = req.body || {};
    const mode = cleanText(body.mode, 20);

    // POST mode=quote: calculate costs only. No video is submitted.
    if (mode === "quote") {
      const quote = await calculateQuote(body);

      return json(res, 200, {
        success: true,
        mode: "quote",
        breakdown: quote.breakdown,
        estimatedTotalCredits: quote.estimatedTotalCredits,
        maxCredits: quote.maxCredits,
        withinLimit: quote.withinLimit,
        resolution: quote.resolution,
        outputSize: quote.outputSize,
        aspectRatio: quote.aspectRatio,
        durationSeconds: quote.durationSeconds,
        sceneCount: quote.sceneCount,
        message: quote.withinLimit
          ? "Estimate is within the credit limit. No video has been submitted."
          : "Estimate exceeds the credit limit. No video has been submitted."
      });
    }

    // POST mode=final: recalculate the estimate on the server,
    // then submit only when the user explicitly approves.
    if (mode === "final") {
      if (body.confirmCost !== true) {
        return json(res, 400, {
          success: false,
          error: "Explicit cost approval is required."
        });
      }

      const quote = await calculateQuote(body);

      if (!quote.withinLimit) {
        return json(res, 402, {
          success: false,
          error:
            `Estimate exceeds your credit limit. ` +
            `Estimated total: ${quote.estimatedTotalCredits}. ` +
            `Maximum allowed: ${quote.maxCredits}. ` +
            `No video was submitted.`,
          estimatedTotalCredits: quote.estimatedTotalCredits,
          breakdown: quote.breakdown
        });
      }

      const edit = buildEdit(quote);

      const data = await shotstackRequest(
        "/render",
        "POST",
        edit
      );

      const renderId = extractRenderId(data);

      if (!renderId) {
        return json(res, 502, {
          success: false,
          error: "Shotstack did not return a render ID.",
          details: data
        });
      }

      return json(res, 200, {
        success: true,
        mode: "final",
        renderId,
        status: data.response?.status || "queued",
        estimatedTotalCredits: quote.estimatedTotalCredits,
        resolution: quote.resolution,
        outputSize: quote.outputSize,
        durationSeconds: quote.durationSeconds,
        message: "Your AI commercial has been submitted."
      });
    }

    return json(res, 400, {
      success: false,
      error: "Invalid mode. Use quote or final."
    });

  } catch (error) {
    console.error("AI Shopping Shorts render error:", error);

    return json(res, 500, {
      success: false,
      error: error.message || "Unexpected render error."
    });
  }
}
