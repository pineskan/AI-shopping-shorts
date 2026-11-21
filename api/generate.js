


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
      throw new Error("OPENAI_API_KEY is missing in Vercel.");
    }

    const body = req.body || {};
    const product = body.product || {};

    const productName = String(product.name || "").trim();

    if (!productName) {
      throw new Error("Product name is required.");
    }

    const price = String(product.price || "").trim();
    const store = String(product.store || "").trim();
    const description = String(product.description || "").trim();
    const features = Array.isArray(product.features)
      ? product.features.map(String).join(", ")
      : String(product.features || "").trim();

    const style = String(body.style || "cinematic").trim();

    const prompt = `
You are a senior American commercial director and advertising copywriter.

Create a premium 28-second vertical shopping advertisement.

PRODUCT INFORMATION:
Name: ${productName}
Price: ${price || "Not provided"}
Store: ${store || "Not provided"}
Description: ${description || "Not provided"}
Features: ${features || "Not provided"}
Creative style: ${style}

IMPORTANT:
- Use natural, fluent American English.
- Never invent product specifications, benefits, ingredients, ratings,
  awards, discounts, or performance claims.
- Only use product facts provided above.
- If information is missing, use appealing but truthful general language.
- Make the advertisement sound human, warm, confident, and persuasive.
- Do not mention unverified prices or promotions.
- The final call to action should encourage viewers to shop.
- Total narration should be approximately 55-65 spoken words.
- Format for a 9:16 vertical video.

CREATE EXACTLY FIVE SCENES:

SCENE 1 — CINEMATIC HOOK
Show a dramatic product hero shot.
Grab attention immediately.

SCENE 2 — PRODUCT DETAILS
Show close-up product imagery and details.
Use only verified product information.

SCENE 3 — LIFESTYLE / AI MODEL
Show a realistic lifestyle scene with a person
using or presenting the product.
Do not claim an actual person endorses the product.

SCENE 4 — KEY APPEAL
Show the product in an attractive setting.
Use concise persuasive narration and captions.

SCENE 5 — SHOPPING CALL TO ACTION
Show the product clearly with price if supplied.
End with "SHOP NOW".

Return valid JSON only, using this exact structure:

{
  "title": "Short advertisement title",
  "script": "Complete English narration",
  "scenes": [
    {
      "scene": 1,
      "duration": 5,
      "name": "Cinematic Hook",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short screen text",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 2,
      "duration": 6,
      "name": "Product Details",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short screen text",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 3,
      "duration": 6,
      "name": "Lifestyle",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short screen text",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 4,
      "duration": 6,
      "name": "Key Appeal",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "Short screen text",
      "narration": "Spoken narration for this scene"
    },
    {
      "scene": 5,
      "duration": 5,
      "name": "Shop Now",
      "visual": "Detailed visual direction",
      "camera": "Camera movement",
      "caption": "SHOP NOW",
      "narration": "Final shopping call to action"
    }
  ]
}
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
          messages: [
            {
              role: "system",
              content: "You create truthful, professional American shopping advertisements. Return valid JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1800,
          response_format: {
            type: "json_object"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message || "OpenAI API request failed."
      );
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }

    let result;

    try {
      result = JSON.parse(content);
    } catch {
      throw new Error("Could not read the generated advertisement.");
    }

    if (
      !result.script ||
      !Array.isArray(result.scenes) ||
      result.scenes.length !== 5
    ) {
      throw new Error("The advertisement must contain a script and exactly five scenes.");
    }

    return res.status(200).json({
      success: true,

      // Existing frontend compatibility
      script: result.script,

      // New 3.0 storyboard data
      title: result.title || productName,
      scenes: result.scenes,

      video: {
        aspectRatio: "9:16",
        width: 1080,
        height: 1920,
        targetDuration: 28,
        format: "mp4"
      }
    });

  } catch (error) {
    console.error("Script generation error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Script generation failed."
    });
  }
}
