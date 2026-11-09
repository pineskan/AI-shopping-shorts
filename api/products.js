
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
    const url = new URL("https://serpapi.com/search.json");

    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", "trending popular products");
    url.searchParams.set("gl", "us");
    url.searchParams.set("hl", "en");
    url.searchParams.set("num", "10");
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || "Product search failed"
      });
    }

    const products = (data.shopping_results || [])
      .slice(0, 5)
      .map(item => ({
        name: item.title || "",
        price: item.price || "",
        imageUrl: item.thumbnail || "",
        store: item.source || "",
        productUrl: item.product_link || ""
      }));

    return res.status(200).json({
      success: true,
      products
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
