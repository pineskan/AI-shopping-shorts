
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "SERPAPI_API_KEY is missing"
    });
  }

  try {
    const query =
      req.query.q || "popular trending products";

    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      gl: "us",
      hl: "en",
      api_key: apiKey
    });

    const response = await fetch(
      `https://serpapi.com/search.json?${params}`
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(502).json({
        error: "Shopping search failed",
        details: errorText
      });
    }

    const data = await response.json();

    const products = (data.shopping_results || [])
      .slice(0, 5)
      .map((item, index) => ({
        rank: index + 1,
        name: item.title || "Unknown product",
        price: item.price || "Price unavailable",
        imageUrl: item.thumbnail || "",
        store: item.source || "Unknown store",
        productUrl: item.product_link || item.link || ""
      }));

    return res.status(200).json({
      success: true,
      country: "United States",
      query,
      count: products.length,
      products
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
}
