

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
      throw new Error(
        "OPENAI_API_KEY is missing in Vercel."
      );
    }

    const body = req.body || {};
    const product = body.product || {};

    if (!product.name) {
      throw new Error("Product name is required.");
    }

    const productName = String(product.name);
    const price = String(product.price || "");
    const store = String(product.store || "");
    const style = String(body.style || "cinematic");

    const prompt = `
You are an expert American advertising creative director.

Create a compelling 20-second English video advertisement.

PRODUCT: ${productName}
PRICE: ${price}
STORE: ${store}
STYLE: ${style}

Requirements:
1. Use natural, fluent American English.
2. Start with a powerful attention-grabbing hook.
3. Explain the product's appeal.
4. Make the narration sound human and persuasive.
5. End with a clear shopping call to action.
6. Keep it approximately 45-55 spoken words.
7. Do not invent product features or unverified claims.
8. Return only the advertisement narration.
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
              content: "You write professional American English shopping advertisements."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 350
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message || "OpenAI API request failed."
      );
    }

    const script =
      data.choices?.[0]?.message?.content?.trim();

    if (!script) {
      throw new Error("OpenAI returned an empty script.");
    }

    return res.status(200).json({
      success: true,
      script
    });

  } catch (error) {
    console.error("Script generation error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Script generation failed."
    });
  }
}
