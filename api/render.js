export default async function handler(req, res) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";

  if (!["stage", "v1"].includes(env)) {
    return res.status(500).json({ success: false, error: "Invalid SHOTSTACK_ENV. Use stage or v1." });
  }
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "SHOTSTACK_API_KEY is missing" });
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
        data?.response?.message || data?.message || data?.error || `Shotstack API error ${response.status}`
      );
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data;
  }

  const json = (status, data) => res.status(status).json(data);

  function responseBody(data) {
    return data?.response || data || {};
  }

  function getCredits(data) {
    const value = data?.response?.credits ?? data?.credits ?? data?.response?.cost ?? data?.cost;
    return Number(value);
  }

  async function quoteAsset(asset, length) {
    const payload = { asset };
    if (typeof length === "number") payload.length = length;
    const data = await api("/generate/quote", { method: "POST", body: JSON.stringify(payload) });
    const credits = getCredits(data);
    if (!Number.isFinite(credits)) {
      throw new Error("Could not read a generation quote from Shotstack. Check the model and account access.");
    }
    return credits;
  }

  function categoryFor(product) {
    const p = product.toLowerCase();
    if (/serum|skincare|skin care|makeup|cosmetic|lipstick|blush|mascara|beauty|shampoo|perfume/.test(p)) return "beauty";
    if (/phone|laptop|computer|headphone|earbud|speaker|camera|tablet|charger|keyboard|monitor|tech/.test(p)) return "technology";
    if (/kitchen|cookware|air fryer|blender|coffee maker|pan|knife|mug|vacuum|cleaner|home/.test(p)) return "home";
    if (/dress|shirt|shoe|sneaker|handbag|bag|jacket|jeans|fashion|watch|jewelry/.test(p)) return "fashion";
    if (/fitness|yoga|workout|massage|wellness|water bottle|supplement|fitness tracker/.test(p)) return "wellness";
    return "lifestyle";
  }

  function modelDirection(category) {
    const directions = {
      beauty: "A polished adult beauty and skincare commercial model, natural healthy-looking skin, refined neutral wardrobe, confident gentle expressions, demonstrating a beauty routine without making medical claims.",
      technology: "A stylish adult technology presenter in a clean modern studio, smart casual wardrobe, confident precise gestures, naturally interacting with the device.",
      home: "A relatable adult lifestyle creator in a beautiful contemporary home or kitchen, practical neutral clothing, naturally demonstrating the household product.",
      fashion: "An adult fashion campaign model with editorial styling, confident natural movement, tasteful wardrobe suited to the product category.",
      wellness: "An active adult lifestyle model in a bright calm wellness setting, comfortable athletic-casual wardrobe, demonstrating a realistic everyday use.",
      lifestyle: "A relatable adult American lifestyle commercial model, contemporary wardrobe, natural expressions and believable everyday product use."
    };
    return directions[category] || directions.lifestyle;
  }

  function styleDirection(style) {
    if (style === "luxury") return "Luxury editorial campaign, restrained premium palette, sculpted studio lighting, elegant slow camera movement, refined composition.";
    if (style === "futuristic") return "Modern futuristic commercial, architectural light forms, crisp reflections, precise camera movement, premium technology-inspired atmosphere.";
    return "Cinematic premium commercial, dramatic but natural lighting, rich contrast, shallow depth of field, controlled dolly and macro camera movement.";
  }

  function safeText(value, max = 180) {
    return String(value || "").trim().slice(0, max);
  }

  function makeScenePrompts({ product, category, model, style, imageUrl, price, store }) {
    const persona = model;
    const look = styleDirection(style);
    const productLine = `Feature this exact product: ${product}.`;
    const noText = "No visible text, no subtitles, no logos, no watermark, no extra fingers, no distorted product.";

    const scenes = [
      {
        name: "Cinematic product opening",
        prompt: `${productLine} ${look} Create a 4-second premium vertical product hero commercial. Place the product in a beautifully lit studio with dramatic highlights, subtle atmospheric depth and a slow cinematic camera push-in. Keep the product recognizable, centered and visually accurate. ${noText}`
      },
      {
        name: "Product features and macro",
        prompt: `${productLine} ${look} Create a 4-second macro commercial shot showing premium details, surface texture, materials and elegant reflections. Use dynamic close-up camera movement and crisp focus. Preserve the product's real-world shape and appearance. ${noText}`
      },
      {
        name: "AI model experience",
        prompt: `${productLine} ${persona} ${look} Create a 4-second realistic lifestyle demonstration. Show the model naturally picking up, holding or using the product in a plausible everyday setting. Keep the product visible and correctly shaped. ${noText}`
      },
      {
        name: "Voice and captions visual",
        prompt: `${productLine} ${persona} ${look} Create a 4-second supporting commercial shot: the same described type of adult model demonstrates the product with a natural confident expression, then a close-up of the product in use. Leave uncluttered visual space in the lower third for separately added captions. ${noText}`
      },
      {
        name: "Price and call to action",
        prompt: `${productLine} ${look} Create a 4-second final hero shot of the product on a premium pedestal or clean lifestyle surface, slow elegant camera pull-back, bright polished highlights, generous uncluttered negative space in the center-lower area for a price and SHOP NOW overlay. ${noText}`
      }
    ];

    return scenes.map((scene, index) => {
      const useImage = Boolean(imageUrl) && index === 0;
      const asset = {
        type: "video",
        prompt: scene.prompt,
        model: useImage ? "seedance-2.0-image-to-video" : "seedance-2.0-text-to-video",
        options: {
          resolution: "1080p",
          aspectRatio: "9:16",
          generateAudio: false
        }
      };
      if (useImage) asset.options.startSrc = imageUrl;
      return { ...scene, asset, start: index * 4, length: 4 };
    });
  }

  try {
    if (req.method === "GET") {
      if (req.query?.models === "1") {
        const data = await api("/models?expand=options");
        return json(200, { success: true, models: responseBody(data) });
      }
      const id = req.query?.id;
      if (!id) return json(400, { success: false, error: "Render ID is required" });
      const data = await api(`/render/${encodeURIComponent(id)}`);
      const render = responseBody(data);
      return json(200, {
        success: render.status !== "failed",
        renderId: render.id || id,
        status: render.status || "unknown",
        videoUrl: render.status === "done" ? (render.url || null) : null,
        downloadReady: render.status === "done" && Boolean(render.url),
        error: render.status === "failed" ? (render.error || "Rendering failed") : null
      });
    }

    if (req.method !== "POST") return json(405, { success: false, error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const {
      mode = "quote",
      product,
      price = "",
      store = "",
      script,
      imageUrl,
      voiceGender = "auto",
      videoStyle = "cinematic",
      music = true,
      maxCredits = 30,
      confirmCost = false
    } = body;

    if (!["quote", "final"].includes(mode)) {
      return json(400, { success: false, error: "Mode must be quote or final" });
    }

    const productName = safeText(product, 180);
    const scriptText = safeText(script, 2500);
    const productPrice = safeText(price, 40);
    const storeName = safeText(store, 100);

    if (!productName || !scriptText) {
      return json(400, { success: false, error: "Product and English script are required" });
    }
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      return json(400, { success: false, error: "Product image URL must use HTTPS" });
    }

    const category = categoryFor(productName);
    const scenes = makeScenePrompts({
      product: productName,
      category,
      model: modelDirection(category),
      style: videoStyle,
      imageUrl,
      price: productPrice,
      store: storeName
    });
        const voiceName = voiceGender === "male" ? "George" : "Charlotte";
    const voiceAsset = {
      type: "audio",
      prompt: scriptText,
      model: "elevenlabs-multilingual-v2",
      options: {
        voice: voiceName,
        language: "en"
      }
    };

    const musicAsset = {
      type: "audio",
      prompt: "A polished upbeat cinematic product-advertising instrumental, modern uplifting pulse, elegant premium sound, no vocals.",
      model: "elevenlabs-music",
      options: { forceInstrumental: true }
    };

    // Check the current account's model access before quoting or submitting.
    const modelData = await api("/models?expand=options");
    const modelResponse = responseBody(modelData);
    const availableModels = Array.isArray(modelResponse) ? modelResponse : (modelResponse.models || []);
    const hasModel = id => availableModels.some(item => item.model === id && item.available !== false);
    const missing = [...new Set(scenes.map(s => s.asset.model))].filter(id => !hasModel(id));
    if (missing.length) {
      return json(403, {
        success: false,
        error: "Your current Shotstack account does not show access to the required AI video model(s): " + missing.join(", "),
        details: "Open Shotstack model access or contact Shotstack support. No render was submitted."
      });
    }

    const videoQuotes = [];
    for (const scene of scenes) {
      videoQuotes.push(await quoteAsset(scene.asset, scene.length));
    }
    const voiceCredits = await quoteAsset(voiceAsset);
    const musicCredits = music ? await quoteAsset(musicAsset, 20) : 0;
    const renderCredits = 20 / 60;
    const totalCredits = videoQuotes.reduce((sum, value) => sum + value, 0) + voiceCredits + musicCredits + renderCredits;
    const creditLimit = Math.max(0, Number(maxCredits) || 0);

    const breakdown = {
      video: Number(videoQuotes.reduce((sum, value) => sum + value, 0).toFixed(4)),
      voice: Number(voiceCredits.toFixed(4)),
      music: Number(musicCredits.toFixed(4)),
      render: Number(renderCredits.toFixed(4))
    };

    if (mode === "quote") {
      return json(200, {
        success: true,
        mode: "quote",
        message: "Estimate only. No final render submitted.",
        breakdown,
        estimatedTotalCredits: Number(totalCredits.toFixed(4)),
        maxCredits: creditLimit,
        withinCreditLimit: totalCredits <= creditLimit,
        scenes: scenes.map(s => ({ name: s.name, seconds: s.length, model: s.asset.model })),
        resolution: "1080x1920",
        durationSeconds: 20,
        category
      });
    }

    if (!confirmCost) {
      return json(400, {
        success: false,
        error: "Final generation requires explicit cost confirmation",
        estimatedTotalCredits: Number(totalCredits.toFixed(4))
      });
    }
    if (totalCredits > creditLimit) {
      return json(402, {
        success: false,
        error: "Estimated cost exceeds your approved credit limit. No final video was submitted.",
        estimatedTotalCredits: Number(totalCredits.toFixed(4)),
        maxCredits: creditLimit
      });
    }

    const videoClips = scenes.map(scene => ({
      asset: scene.asset,
      start: scene.start,
      length: scene.length,
      fit: "crop"
    }));

    const captionClip = {
      asset: {
        type: "rich-caption",
        src: "alias://voiceover",
        font: {
          family: "Roboto",
          size: 46,
          color: "#ffffff",
          weight: "700"
        },
        align: { vertical: "bottom", horizontal: "center" },
        stroke: { width: 3, color: "#000000", opacity: 1 },
        shadow: { offsetX: 0, offsetY: 2, blur: 5, color: "#000000", opacity: 0.8 },
      },
      start: 0,
      length: 20
    };

    const endCardText = [
      productPrice ? productPrice + "  ·  SHOP NOW" : "SHOP NOW",
      storeName ? "AVAILABLE AT " + storeName.toUpperCase() : "TAP THE LINK TO SHOP"
    ].join("\n");

    const endCardClip = {
      asset: {
        type: "rich-text",
        text: endCardText,
        font: {
          family: "Roboto",
          size: 64,
          weight: "700",
          color: "#ffffff",
          background: "#111827"
        },
        align: { horizontal: "center", vertical: "middle" },
        background: { color: "#111827", opacity: 0.78, borderRadius: 18, wrap: false, padding: 18 },
        stroke: { width: 2, color: "#000000", opacity: 0.6 },
      },
      start: 16,
      length: 4,
      position: "center"
    };

    const tracks = [
      { clips: [captionClip] },
      { clips: [endCardClip] },
      { clips: videoClips },
      {
        clips: [{
          alias: "voiceover",
          asset: voiceAsset,
          start: 0,
          length: 20,
          volume: 1
        }]
      }
    ];

    if (music) {
      tracks.push({
        clips: [{
          asset: musicAsset,
          start: 0,
          length: 20,
          volume: 0.14
        }]
      });
    }

    const edit = {
      timeline: {
        background: "#05070c",
        tracks
      },
      output: {
        format: "mp4",
        size: { width: 1080, height: 1920 },
        fps: 30
      }
    };

    const renderData = await api("/render", {
      method: "POST",
      body: JSON.stringify(edit)
    });
    const renderResponse = responseBody(renderData);
    const renderId = renderResponse.id;
    if (!renderId) throw new Error("Shotstack did not return a render ID.");

    return json(200, {
      success: true,
      mode: "final",
      message: "Five-scene 1080p cinematic rendering started",
      renderId,
      product: productName,
      category,
      resolution: "1080x1920",
      durationSeconds: 20,
      sceneCount: 5,
      scenes: scenes.map(s => ({ name: s.name, seconds: s.length, model: s.asset.model })),
      estimatedCredits: Number(totalCredits.toFixed(4)),
      status: renderResponse.status || "queued",
      statusEndpoint: `?id=${encodeURIComponent(renderId)}`
    });
  } catch (error) {
    console.error("AI SHOPPING SHORTS RENDER ERROR:", JSON.stringify(error.details || error.message, null, 2));
    return json(error.status || 500, {
      success: false,
      error: error.message || "Video generation failed",
      details: error.details || null
    });
  }
}
