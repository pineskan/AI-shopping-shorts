

// api/generate.js
// AI Shopping Shorts 3.0
// CapCut workflow: script + five-scene storyboard only

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST method required."
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is missing in Vercel."
      });
    }

    const body = req.body || {};
    const product = body.product || {};

    const name = String(product.name || "").trim().slice(0, 180);
    const price = String(product.price || "").trim().slice(0, 60);
    const store = String(product.store || "").trim().slice(0, 100);
    const style = String(body.style || "cinematic").trim();
    const voice = body.voice === "male" ? "male" : "female";

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Product name is required."
      });
    }

    const styles = {
      cinematic: "cinematic premium commercial, dramatic lighting, elegant camera movement",
      luxury: "luxury beauty commercial, refined lighting, premium editorial look",
      futuristic: "modern futuristic commercial, sleek lighting, dynamic visual transitions",
      lifestyle: "authentic lifestyle commercial, warm natural light, relatable everyday setting"
    };

    const visualStyle = styles[style] || styles.cinematic;

    const prompt = `
You are an award-winning American commercial creative director.

Create a complete short-form shopping advertisement plan.

PRODUCT:
Name: ${name}
Price: ${price || "Not provided"}
Store: ${store || "Not provided"}

VISUAL STYLE:
${visualStyle}

PRESENTER:
${voice} adult American commercial presenter.
The presenter should look natural, confident, friendly and realistic.

IMPORTANT RULES:
- Do not invent product specifications, ingredients, awards, test results,
  health benefits, discounts or performance claims.
- Use only facts supplied in the product information.
- If product details are limited, focus on presentation, design,
  shopping appeal and a clear call to action.
- Write natural conversational American English.
- Avoid exaggerated or misleading claims.
- The final advertisement should be approximately 28 seconds.
- Total spoken narration should be approximately 55 to 65 words.

Return ONLY valid JSON in this exact structure:

{
  "title": "Short campaign title",
  "script": "Complete spoken English advertisement",
  "scenes": [
    {
      "scene": 1,
      "duration": 5,
      "name": "Opening Hook",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short on-screen caption",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 2,
      "duration": 6,
      "name": "Product Reveal",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short on-screen caption",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 3,
      "duration": 6,
      "name": "Lifestyle Demonstration",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short on-screen caption",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 4,
      "duration": 6,
      "name": "Product Details",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short on-screen caption",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 5,
      "duration": 5,
      "name": "Final Call To Action",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short call to action",
      "narration": "Spoken narration for this scene"
    }
  ]
}

Make the five scene narrations add up to the complete script.
Use visually specific directions suitable for manual editing in CapCut.
Every scene must be vertical 9:16.
`;

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You create accurate, polished American English shopping advertisements. Return valid JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2200
        })
      }
    );

    const raw = await response.text();
    let result;

    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `OpenAI returned an invalid response: ${raw.slice(0, 400)}`
      );
    }

    if (!response.ok) {
      throw new Error(
        result.error?.message || `OpenAI request failed (${response.status}).`
      );
    }

    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI did not return advertisement content.");
    }

    let ad;

    try {
      ad = JSON.parse(content);
    } catch {
      throw new Error("AI returned invalid storyboard JSON.");
    }

    if (!Array.isArray(ad.scenes) || ad.scenes.length !== 5) {
      throw new Error("AI must return exactly five scenes.");
    }

    const scenes = ad.scenes.map((scene, index) => ({
      scene: index + 1,
      duration: Number(scene.duration) || [5, 6, 6, 6, 5][index],
      name: String(scene.name || `Scene ${index + 1}`),
      visual: String(scene.visual || ""),
      camera: String(scene.camera || ""),
      caption: String(scene.caption || ""),
      narration: String(scene.narration || "")
    }));

    const script = String(ad.script || "").trim();

    if (!script) {
      throw new Error("Advertisement script is empty.");
    }

    return res.status(200).json({
      success: true,
      title: String(ad.title || name),
      script,
      scenes,
      product: { name, price, store },
      video: {
        aspectRatio: "9:16",
        width: 1080,
        height: 1920,
        format: "mp4",
        targetDurationSeconds: 28,
        finalEditor: "CapCut"
      }
    });

  } catch (error) {
    console.error("GENERATE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Advertisement generation failed."
    });
  }
}
