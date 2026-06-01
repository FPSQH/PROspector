/**
 * Serveur local BDNB Explorer
 * Lance avec : node scripts/bdnb-server.mjs
 * Puis ouvre  : http://localhost:3456
 */

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PORT = 3456;
const BDNB_BASE = "api-open.bdnb.io";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const HTML_FILE = path.join(__dir, "bdnb-explore.html");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Proxy BDNB ──────────────────────────────────────────────────────────
  if (url.pathname.startsWith("/bdnb/")) {
    const bdnbPath = url.pathname.replace("/bdnb/", "/v2/") + url.search;
    console.log(`[BDNB] → https://${BDNB_BASE}${bdnbPath}`);

    const options = {
      hostname: BDNB_BASE,
      path: bdnbPath,
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "PROspector-Explorer/1.0",
        Prefer: "count=exact",
      },
    };

    const proxy = https.request(options, (upstream) => {
      console.log(`[BDNB] ← ${upstream.statusCode} (content-range: ${upstream.headers["content-range"] ?? "—"})`);

      // En cas d'erreur BDNB, loguer le body pour diagnostic
      if (upstream.statusCode >= 400) {
        let body = "";
        upstream.on("data", (d) => body += d);
        upstream.on("end", () => {
          console.error(`[BDNB] Erreur body: ${body}`);
          res.writeHead(upstream.statusCode, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(body);
        });
        return;
      }

      res.writeHead(upstream.statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Content-Range": upstream.headers["content-range"] ?? "",
      });
      upstream.pipe(res);
    });

    proxy.on("error", (e) => {
      console.error(`[BDNB] Erreur réseau: ${e.message}`);
      res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: e.message }));
    });

    proxy.end();
    return;
  }

  // ── Sert le fichier HTML ─────────────────────────────────────────────────
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const html = fs.readFileSync(HTML_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end(`Fichier introuvable : ${HTML_FILE}`);
    }
    return;
  }

  console.log(`[404] ${req.url}`);
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n✅ BDNB Explorer démarré`);
  console.log(`   → Ouvre http://localhost:${PORT} dans ton navigateur`);
  console.log(`   Ctrl+C pour arrêter\n`);
});
