
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is missing."
    });
  }

  try {
    const { product, duration = 15 } = req.body || {};

    if (!product || typeof product !== "string" || !product.trim()) {
      return res.status(400).json({
        error: "Please enter a product name."
      });
    }

    const safeDuration = Math.min(
      60,
      Math.max(8, Number(duration) || 15)
    );

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
          instructions:
            "You are a professional American shopping advertisement writer. Write natural, persuasive spoken English for short-form video ads. Never invent product specifications, prices, ratings, or benefits.",
          input:
            `Write an English shopping advertisement for this product: ${product.trim()}.

Target length: approximately ${safeDuration} seconds.

Requirements:
1. Start with an attention-grabbing opening.
2. Explain up to three realistic benefits.
3. Use friendly, natural American English.
4. Finish with a clear call to action.
5. Do not include headings, scene labels, or explanations.
6. Do not invent product specifications or unsupported claims.

Return only the advertisement script.`
        })
      }
    );

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("OpenAI error:", aiData);

      return res.status(aiResponse.status).json({
        error:
          aiData.error?.message ||
          "OpenAI advertisement generation failed."
      });
    }

    const script = (aiData.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n")
      .trim();

    if (!script) {
      console.error("Empty OpenAI response:", aiData);

      return res.status(500).json({
        error: "AI returned an empty advertisement script."
      });
    }

    return res.status(200).json({
      success: true,
      script
    });

  } catch (error) {
    console.error("Script generation error:", error);

    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
}
