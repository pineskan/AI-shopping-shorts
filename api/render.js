
export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";

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

  try {
    // CHECK RENDER STATUS
    if (req.method === "GET") {
      const id = req.query?.id;

      if (!id) {
        return res.status(400).json({
          error: "Render ID is required"
        });
      }

      const response = await fetch(
        `${base}/render/${encodeURIComponent(id)}`,
        {
          headers: {
            Accept: "application/json",
            "x-api-key": apiKey
          }
        }
      );

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // CREATE VIDEO
    const { script, imageUrl, audioUrl, product } = req.body || {};

    if (!script || !imageUrl) {
      return res.status(400).json({
        error: "Script and image URL are required"
      });
    }

    if (
      !/^https:\/\//i.test(imageUrl) ||
      (audioUrl && !/^https:\/\//i.test(audioUrl))
    ) {
      return res.status(400).json({
        error: "Only HTTPS media URLs are accepted"
      });
    }

    // AI-STYLE SELECTION BASED ON PRODUCT
    const name = String(product || "").toLowerCase();

    let effects = [
      "zoomIn",
      "zoomOut",
      "slideLeft",
      "slideRight"
    ];

    if (/earbud|headphone|speaker|audio/.test(name)) {
      effects = [
        "zoomIn",
        "slideLeft",
        "zoomOut",
        "slideRight"
      ];
    } else if (/watch|jewel|ring|fashion|shoe/.test(name)) {
      effects = [
        "zoomIn",
        "slideRight",
        "zoomOut",
        "slideLeft"
      ];
    } else if (/camera|phone|computer|laptop|tablet/.test(name)) {
      effects = [
        "slideLeft",
        "zoomIn",
        "slideRight",
        "zoomOut"
      ];
    } else if (/kitchen|home|clean|vacuum/.test(name)) {
      effects = [
        "zoomOut",
        "slideRight",
        "zoomIn",
        "slideLeft"
      ];
    }

    // SPLIT SCRIPT INTO FOUR SCENES
    const sentences = String(script)
      .replace(/\s+/g, " ")
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [script];

    const chunks = ["", "", "", ""];

    sentences.forEach((sentence, index) => {
      const target = Math.min(
        3,
        Math.floor(index * 4 / sentences.length)
      );

      chunks[target] += sentence.trim() + " ";
    });

    const duration = 9;

    const imageClips = effects.map((effect, index) => ({
      asset: {
        type: "image",
        src: imageUrl
      },
      start: index * duration,
      length: duration,
      effect
    }));

    const textClips = chunks
      .filter(chunk => chunk.trim())
      .map((chunk, index) => ({
        asset: {
          type: "rich-text",
          text: chunk.trim().slice(0, 220),
          font: {
            family: "Montserrat",
            size: 38,
            weight: "700",
            color: "#ffffff"
          },
          align: {
            horizontal: "center",
            vertical: "middle"
          },
          background: {
            color: "#101827",
            opacity: 0.65
          }
        },
        start: index * duration,
        length: duration,
        position: "center"
      }));

    const tracks = [
      { clips: imageClips },
      { clips: textClips }
    ];

    if (audioUrl) {
      tracks.push({
        clips: [
          {
            asset: {
              type: "audio",
              src: audioUrl
            },
            start: 0,
            length: "end"
          }
        ]
      });
    }

    const edit = {
      timeline: {
        background: "#000000",
        tracks
      },
      output: {
        format: "mp4",
        resolution: "hd",
        aspectRatio: "9:16",
        fps: 30
      }
    };

    const response = await fetch(`${base}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(edit)
    });

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Video rendering failed"
    });
  }
}
