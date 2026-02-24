const { Readable } = require("stream");

module.exports = async function (req, res) {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  const controller = new AbortController();

  // If client disconnects, abort the fetch request
  req.on("close", () => {
    controller.abort();
  });

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Referer: "https://myrient.erista.me/files",
        "User-Agent": "Wget/1.21.2",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    // Forward headers we care about
    const headersToForward = [
      "content-type",
      "content-disposition",
      "content-length",
    ];
    headersToForward.forEach((header) => {
      const val = response.headers.get(header);
      if (val) {
        res.setHeader(header, val);
      }
    });

    res.status(response.status);

    if (response.body) {
      const readable = Readable.fromWeb(response.body);
      readable.on("error", (err) => {
        if (err.name !== "AbortError") {
          console.error("Stream error:", err);
        }
      });
      readable.pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    if (e.name !== "AbortError") {
      console.error(`Fetch error for proxy URL: ${targetUrl}`, e.message);
      if (!res.headersSent) {
        res.status(500).send("Failed to proxy download: " + e.message);
      }
    }
  }
};
