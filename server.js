const express = require("express");
const cors = require("cors");
const scdl = require("soundcloud-downloader").default;

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

/**
 * GET /api/scdlv2?query=<song name>
 *
 * Response shape (matches the client code you already have):
 * {
 *   status: true,
 *   result: {
 *     title: "...",
 *     artist: "...",
 *     duration: 123456,        // ms
 *     thumbnail: "https://...",
 *     download_url: "https://.../stream"  // proxied through this API
 *   }
 * }
 */
app.get("/api/scdlv2", async (req, res) => {
  const query = (req.query.query || "").trim();

  if (!query) {
    return res.status(400).json({
      status: false,
      message: "Missing 'query' parameter. Example: /api/scdlv2?query=Happy Nation",
      credit: {
        name: "HELIX TANVIR",
        contact: "https://www.facebook.com/mdtanvir.albert/",
      },
    });
  }

  try {
    // 1. Search SoundCloud for matching tracks
    const results = await scdl.search({
      query,
      limit: 5,
      resourceType: "tracks",
    });

    const track = results?.collection?.find((t) => t.streamable && t.kind === "track");

    if (!track) {
      return res.status(404).json({
        status: false,
        message: "No streamable results found for that query.",
      });
    }

    // 2. Build our own proxied stream URL instead of exposing SoundCloud's
    //    signed CDN URL directly (those expire and require the client_id).
    const downloadUrl = `${req.protocol}://${req.get("host")}/api/stream?track=${encodeURIComponent(
      track.permalink_url
    )}`;

    return res.json({
      status: true,
      result: {
        title: track.title,
        artist: track.user?.username || "Unknown",
        duration: track.duration,
        thumbnail: track.artwork_url || track.user?.avatar_url || null,
        download_url: downloadUrl,
      },
      credit: {
        name: "HELIX TANVIR",
        contact: "https://www.facebook.com/mdtanvir.albert/",
      },
    });
  } catch (err) {
    console.error("Search error:", err.message);
    return res.status(500).json({
      status: false,
      message: "Failed to search : " + err.message,
    });
  }
});

/**
 * GET /api/stream?track=<permalink_url>
 *
 * Streams the actual audio bytes. This is what /api/scdlv2's
 * download_url points to, and what your bot's axios({ responseType: "stream" })
 * call downloads.
 */
app.get("/api/stream", async (req, res) => {
  const trackUrl = req.query.track;

  if (!trackUrl || !scdl.isValidUrl(trackUrl)) {
    return res.status(400).json({ status: false, message: "Invalid or missing 'track' URL." });
  }

  try {
    const stream = await scdl.download(trackUrl);
    res.setHeader("Content-Type", "audio/mpeg");
    stream.pipe(res);
    stream.on("error", (err) => {
      console.error("Stream error:", err.message);
      if (!res.headersSent) res.status(500).end();
    });
  } catch (err) {
    console.error("Download error:", err.message);
    return res.status(500).json({ status: false, message: "Failed to stream track: " + err.message });
  }
});

app.get("/", (_req, res) => {
  res.json({
    status: true,
    message: "HELIX API is running.",
    credit: {
      name: "HELIX TANVIR",
      contact: "https://www.facebook.com/mdtanvir.albert/",
    },
  });
});

app.listen(PORT, () => {
  console.log(`SCDL API running at http://localhost:${PORT}`);
});
