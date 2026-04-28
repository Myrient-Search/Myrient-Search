const { query } = require("../db");
const torrentService = require("../torrentService");

module.exports = async function (req, res) {
  let release = null;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (release) release();
  };

  let aborted = false;
  req.on("close", () => {
    aborted = true;
    cleanup();
  });

  try {
    const idParam = req.query.id;
    let magnet = req.query.magnet;
    let soId = req.query.so_id;
    let filename = req.query.filename;

    if (idParam) {
      const id = parseInt(idParam, 10);
      if (isNaN(id)) return res.status(400).send("Invalid id");
      const { rows } = await query(
        "SELECT magnet, so_id, filename FROM games WHERE id = $1",
        [id],
      );
      if (!rows.length) return res.status(404).send("Game not found");
      magnet = rows[0].magnet || magnet;
      soId = rows[0].so_id != null ? rows[0].so_id : soId;
      filename = rows[0].filename || filename;
    }

    if (!magnet) {
      return res
        .status(503)
        .send("This file has no magnet — it cannot be served via torrent.");
    }

    if (typeof soId === "string") soId = parseInt(soId, 10);
    if (Number.isNaN(soId)) soId = undefined;

    let file;
    try {
      const sel = await torrentService.selectFile({ magnet, soId, filename });
      file = sel.file;
      release = sel.release;
    } catch (err) {
      console.error("[proxy-download] torrent error:", err.message || err);
      cleanup();
      if (!res.headersSent) {
        res.status(502).send("Failed to load torrent: " + (err.message || err));
      }
      return;
    }

    if (aborted) {
      cleanup();
      return;
    }

    const totalSize = file.length;
    const range = req.headers.range;
    let start = 0;
    let end = totalSize - 1;
    let status = 200;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        if (m[1] !== "") start = Math.min(parseInt(m[1], 10), totalSize - 1);
        if (m[2] !== "") end = Math.min(parseInt(m[2], 10), totalSize - 1);
        if (start > end) {
          cleanup();
          res.status(416).setHeader("Content-Range", `bytes */${totalSize}`);
          return res.end();
        }
        status = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      }
    }

    const safeName = (filename || file.name || "download").replace(/"/g, '\\"');
    res.status(status);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", end - start + 1);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

    const stream = file.createReadStream({ start, end });
    stream.on("error", (err) => {
      console.error("[proxy-download] stream error:", err.message || err);
      cleanup();
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.on("end", cleanup);
    stream.on("close", cleanup);
    res.on("close", cleanup);
    stream.pipe(res);
  } catch (err) {
    console.error("[proxy-download] unexpected error:", err?.stack || err?.message || err);
    cleanup();
    if (!res.headersSent) {
      res.status(500).send("Internal error: " + (err?.message || err));
    } else {
      res.destroy();
    }
  }
};
