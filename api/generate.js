
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const shotstackKey = process.env.SHOTSTACK_API_KEY;

  // Sandbox key uses "stage".
  // For a Production Shotstack key, change to "v1".
  const environment = process.env.SHOTSTACK_ENV || "stage";
  const shotstackUrl =
    `https://api.shotstack.io/edit/${environment}`;

  try {
    const {
      action = "generate",
      product,
      script: suppliedScript,
      imageUrl,
      duration = 15,
      renderId
    } = req.body || {};

    // Check render status
    if (action === "status") {
      if (!renderId) {
        return res.status(400).json({
          error: "Missing renderId."
        });
      }

      const response = await fetch(
        `${shotstackUrl}/render/${encodeURIComponent(renderId)}`,
        {
          headers: {
            "x-api-key": shotstackKey
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: data.message || "Could not check render status."
        });
      }

      const result = data.response || data;

      return res.status(200).json({
        status: result.status,
        videoUrl: result.url || null,
        error: result.error || null
      });
    }

    if (!shotstackKey) {
      return res.status(500).json({
        error: "SHOTSTACK_API_KEY is missing."
      });
    }

    let script = suppliedScript;

    // Generate English advertisement
    if (action === "generate") {
      if (!apiKey) {
        return res.status(500).json({
          error: "OPENAI_API_KEY is missing."
        });
      }

      if (!product || typeof product !== "string") {
        return res.status(400).json({
          error: "Please provide a product name."
        });
      }

      const aiResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            input: `Write a persuasive, natural English shopping
advertisement for: ${product}.

Duration: ${duration} seconds.
Include a strong opening hook, three benefits,
and a friendly call to action.
Do not invent specifications or unsupported claims.
Use natural American English.`
          })
        }
      );

      const aiData = await aiResponse.json();

      if (!aiResponse.ok) {
        return res.status(aiResponse.status).json({
          error: aiData.error?.message || "OpenAI request failed."
        });
      }

      script = (aiData.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n");
    }

    if (action !== "generate" && action !== "render") {
      return res.status(400).json({
        error: "Invalid action."
      });
    }

    if (!script || typeof script !== "string") {
      return res.status(400).json({
        error: "Please provide an English advertisement script."
      });
    }

    const videoLength = Math.min(
      60,
      Math.max(8, Number(duration) || 15)
    );

    // Divide the advertisement into three scenes
    const sentences = script
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [script];

    const scenes = [
      sentences[0] || script,
      sentences.slice(1, -1).join(" ") || script,
      sentences[sentences.length - 1] || script
    ];

    const sceneLength = videoLength / 3;

    const titleClips = scenes.map((text, index) => ({
      asset: {
        type: "title",
        text: text.trim(),
        style: "chunk",
        color: "#FFFFFF",
        size: "large",
        position: "center"
      },
      start: index * sceneLength,
      length: sceneLength,
      transition: {
        in: "fade",
        out: "fade"
      }
    }));

    const tracks = [
      { clips: titleClips }
    ];

    // Add a product photo when a public image URL is supplied
    if (
      typeof imageUrl === "string" &&
      imageUrl.startsWith("https://")
    ) {
      tracks.push({
        clips: [{
          asset: {
            type: "image",
            src: imageUrl
          },
          start: 0,
          length: videoLength,
          fit: "cover"
        }]
      });
    }

    const edit = {
      timeline: {
        background: "#172033",
        tracks
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

    // Submit video to Shotstack
    const renderResponse = await fetch(
      `${shotstackUrl}/render`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": shotstackKey
        },
        body: JSON.stringify(edit)
      }
    );

    const renderData = await renderResponse.json();

    if (!renderResponse.ok) {
      return res.status(renderResponse.status).json({
        error:
          renderData.message ||
          renderData.error ||
          "Shotstack rendering failed."
      });
    }

    return res.status(200).json({
      success: true,
      script,
      renderId: renderData.response.id,
      status: "queued",
      message: "Your video is being rendered."
    });

  } catch (error) {
    console.error("Video generation error:", error);

    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
}
