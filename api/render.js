
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.SHOTSTACK_API_KEY;
  const env = process.env.SHOTSTACK_ENV || "stage";

  if (!apiKey) {
    return res.status(500).json({
      error: "SHOTSTACK_API_KEY is missing"
    });
  }

  const host =
    env === "v1"
      ? "https://api.shotstack.io"
      : "https://api.shotstack.io/stage";

  const body = req.body || {};
  const videoUrl = body.videoUrl;
  const audioUrl = body.audioUrl;

  if (!videoUrl || !audioUrl) {
    return res.status(400).json({
      error: "videoUrl and audioUrl are required"
    });
  }

  const edit = {
    timeline: {
      background: "#000000",
      tracks: [
        {
          clips: [
            {
              asset: {
                type: "video",
                src: videoUrl
              },
              start: 0,
              length: 30
            }
          ]
        },
        {
          clips: [
            {
              asset: {
                type: "audio",
                src: audioUrl
              },
              start: 0,
              length: 30
            }
          ]
        }
      ]
    },
    output: {
      format: "mp4",
      resolution: "hd",
      aspectRatio: "9:16"
    }
  };

  try {
    const response = await fetch(
      `${host}/edit/v1/render`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey
        },
        body: JSON.stringify(edit)
      }
    );

    const result = await response.json();

    return res.status(response.status).json(result);

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
