const SN_API_KEY = atob("YzhjMmI4NjMzNzE1NGNkYWJjOTg5YjIzZTMwYzZiZjQ=");

async function snLogin(email, password) {
  const res = await fetch("https://auth.simperium.com/1/chalk-bump-f49/authorize/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Simperium-API-Key": SN_API_KEY,
    },
    body: JSON.stringify({ username: email, password: password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

async function snGetNotes(token) {
  const res = await fetch("https://api.simperium.com/1/chalk-bump-f49/note/index?data=true&limit=100", {
    headers: { "X-Simperium-Token": token },
  });
  const data = await res.json();
  return data.index || [];
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeEpub(title, body) {
  const htmlBody = body
    .split("\n")
    .map((l) => `<p>${escapeXml(l)}</p>`)
    .join("\n");

  const mimetype = "application/epub+zip";

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${escapeXml(title)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>`;

  const contentXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${escapeXml(title)}</title></head>
  <body>
    <h1>${escapeXml(title)}</h1>
    ${htmlBody}
  </body>
</html>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Navigation</title></head>
  <body>
    <nav epub:type="toc">
      <ol><li><a href="content.xhtml">${escapeXml(title)}</a></li></ol>
    </nav>
  </body>
</html>`;

  return createZip({
    mimetype: mimetype,
    "META-INF/container.xml": container,
    "content.opf": opf,
    "content.xhtml": contentXhtml,
    "nav.xhtml": nav,
  });
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const entries = Object.entries(files);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const data = new TextEncoder().encode(content);
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);

    // Local file header (30 bytes + name + data)
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);         // version needed
    lv.setUint16(6, 0, true);          // flags
    lv.setUint16(8, 0, true);          // compression: store
    lv.setUint16(10, 0, true);         // mod time
    lv.setUint16(12, 0, true);         // mod date
    lv.setUint32(14, crc, true);       // crc32
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // name length
    lv.setUint16(28, 0, true);         // extra length
    local.set(nameBytes, 30);

    // Central directory header (46 bytes + name)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);         // version needed
    cv.setUint16(8, 0, true);          // flags
    cv.setUint16(10, 0, true);         // compression: store
    cv.setUint16(12, 0, true);         // mod time
    cv.setUint16(14, 0, true);         // mod date
    cv.setUint32(16, crc, true);       // crc32
    cv.setUint32(20, data.length, true); // compressed size
    cv.setUint32(24, data.length, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true); // name length
    cv.setUint16(30, 0, true);         // extra length
    cv.setUint16(32, 0, true);         // comment length
    cv.setUint16(34, 0, true);         // disk number
    cv.setUint16(36, 0, true);         // internal attrs
    cv.setUint32(38, 0, true);         // external attrs
    cv.setUint32(42, offset, true);    // local header offset
    central.set(nameBytes, 46);

    localParts.push(local, data);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const c of centralParts) centralSize += c.length;

  // End of central directory (22 bytes)
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);            // signature
  ev.setUint16(4, 0, true);                      // disk number
  ev.setUint16(6, 0, true);                      // central dir disk
  ev.setUint16(8, entries.length, true);          // entries on disk
  ev.setUint16(10, entries.length, true);         // total entries
  ev.setUint32(12, centralSize, true);            // central dir size
  ev.setUint32(16, centralOffset, true);          // central dir offset
  ev.setUint16(20, 0, true);                     // comment length

  const all = [...localParts, ...centralParts, end];
  const totalLen = all.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const a of all) {
    result.set(a, pos);
    pos += a.length;
  }
  return result;
}

export default {
  async fetch(request, env) {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Simplenote"' },
      });
    }

    const decoded = atob(auth.slice(6));
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) {
      return new Response("Bad credentials format", { status: 400 });
    }
    const email = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    const allowed = (env.ALLOWED_EMAILS || "*").trim();
    if (allowed !== "*") {
      const allowedList = allowed.split(",").map((e) => e.trim().toLowerCase());
      if (!allowedList.includes(email.toLowerCase())) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const token = await snLogin(email, password);
    if (!token) {
      return new Response("Invalid Simplenote credentials", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Simplenote"' },
      });
    }

    const notes = await snGetNotes(token);
    const url = new URL(request.url);

    if (url.pathname.startsWith("/note/")) {
      const noteId = decodeURIComponent(
        url.pathname.slice(6).replace(/\.epub$/, "")
      );
      const note = notes.find((n) => n.id === noteId);
      if (!note) return new Response("Not Found", { status: 404 });

      const content = note.d?.content || "";
      const lines = content.trim().split("\n");
      const title = lines[0] || "Untitled";
      const body = lines.slice(1).join("\n");
      const epubData = makeEpub(title, body);

      return new Response(epubData, {
        headers: {
          "Content-Type": "application/epub+zip",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.epub"`,
        },
      });
    }

    let entries = "";
    for (const note of notes) {
      if (note.d?.deleted) continue;
      const content = note.d?.content || "";
      const lines = content.trim().split("\n");
      const title = lines[0] || "Untitled";
      const summary = lines.slice(1, 3).join(" ").slice(0, 200);
      const tags = note.d?.tags || [];

      let categoryXml = "";
      for (const tag of tags) {
        categoryXml += `\n    <category term="${escapeXml(tag)}"/>`;
      }

      entries += `
  <entry>
    <title>${escapeXml(title)}</title>
    <id>urn:uuid:${note.id}</id>
    <updated>${new Date().toISOString()}</updated>
    <summary>${escapeXml(summary)}</summary>${categoryXml}
    <link rel="http://opds-spec.org/acquisition"
          href="${url.origin}/note/${encodeURIComponent(note.id)}.epub"
          type="application/epub+zip"/>
  </entry>`;
    }

    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:uuid:simplenote-opds</id>
  <title>My Simplenote Library</title>
  <updated>${new Date().toISOString()}</updated>
  <author>
    <name>${escapeXml(email)}</name>
  </author>
  ${entries}
</feed>`;

    return new Response(feed, {
      headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
    });
  },
};
