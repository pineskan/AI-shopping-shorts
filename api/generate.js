
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { product } = req.body || {};

    if (!product || typeof product !== "string") {
      return res.status(400).json({
        error: "Please provide a product name."
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: `Write a persuasive, natural 30-second English shopping advertisement for this product: ${product}. Include a strong opening hook, 3 benefits, and a friendly call to action. Do not invent product specifications or unsupported claims.`
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "OpenAI request failed."
      });
    }

    const script = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");

    return res.status(200).json({ script });

  } catch (error) {
    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
}
