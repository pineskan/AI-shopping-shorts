
export default async function handler(req, res) {
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

  const base =
    `https://api.shotstack.io/edit/${env}`;

  try {
    if (req.method === "POST") {
      const {script, imageUrl, audioUrl} = req.body || {};

      if (!script || !imageUrl) {
        return res.status(400).json({
          error: "Script and image URL are required"
        });
      }

      if (
        !imageUrl.startsWith("https://") ||
        (audioUrl && !audioUrl.startsWith("https://"))
      ) {
        return res.status(400).json({
          error: "Only HTTPS media URLs are accepted"
        });
      }

      const tracks = [
        {
          clips: [
            {
              asset: {
                type: "rich-text",
                text: script.slice(0, 500),
                font: {
                  family: "Montserrat",
                  size: 42,
                  weight: "700",
                  color: "#ffffff"
                },
                align: {
                  horizontal: "center",
                  vertical: "middle"
                },
                background: {
                  color: "#111827",
                  opacity: 0.7
                }
              },
              start: 0,
              length: 20
            }
          ]
        },
        {
          clips: [
            {
              asset: {
                type: "image",
                src: imageUrl
              },
              start: 0,
              length: 20,
              effect: "zoomIn"
            }
          ]
        }
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
          aspectRatio: "9:16"
        }
      };

      const response = await fetch(
        `${base}/render`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": apiKey
          },
          body: JSON.stringify(edit)
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    }

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
            "Accept": "application/json",
            "x-api-key": apiKey
          }
        }
      );

      const data = await response.json();

      return res.status(response.status).json(data);
    }

    return res.status(405).json({
      error: "Method not allowed"
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
