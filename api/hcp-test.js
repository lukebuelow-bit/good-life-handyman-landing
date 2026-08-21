export default async function handler(req, res) {
  try {
    if (!process.env.HCP_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "HCP_API_KEY is missing"
      });
    }

    const tests = [
      "https://api.housecallpro.com/leads?page_size=3",
      "https://api.housecallpro.com/lead?page_size=3"
    ];

    const results = [];

    for (const url of tests) {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.HCP_API_KEY}`,
          Accept: "application/json"
        }
      });

      const text = await response.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      results.push({
        url,
        status: response.status,
        ok: response.ok,
        data
      });
    }

    return res.status(200).json({
      ok: true,
      results
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}