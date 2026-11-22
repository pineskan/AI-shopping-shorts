

// api/trending.js
// AI Shopping Shorts 3.0
// US Google Shopping product search

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "GET method required."
    });
  }

  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "SERPAPI_API_KEY is missing in Vercel."
    });
  }

  try {
    const query = String(
      req.query.q || "popular trending products"
    ).trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Search query is required."
      });
    }

    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      gl: "us",
      hl: "en",
      api_key: apiKey
    });

    const response = await fetch(
      "https://serpapi.com/search.json?" + params.toString()
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(502).json({
        success: false,
        error: "Shopping search failed.",
        details: errorText.slice(0, 400)
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
    console.error("TRENDING ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Product search failed."
    });
  }
}
