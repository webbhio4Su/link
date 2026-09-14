const HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Shortener</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: Arial, sans-serif;
      background: #f5f5f5;
    }

    .box {
      width: min(600px, 92%);
      background: white;
      padding: 30px;
      border-radius: 20px;
      box-shadow: 0 10px 35px rgba(0,0,0,.08);
    }

    h1 {
      margin-top: 0;
      text-align: center;
    }

    input {
      width: 100%;
      padding: 14px;
      border: 1px solid #ddd;
      border-radius: 12px;
      font-size: 16px;
      outline: none;
    }

    button {
      width: 100%;
      margin-top: 12px;
      padding: 14px;
      border: 0;
      border-radius: 12px;
      background: #000;
      color: white;
      font-size: 16px;
      cursor: pointer;
    }

    button:hover {
      opacity: .85;
    }

    #result {
      margin-top: 18px;
      word-break: break-all;
    }

    #result a {
      color: #06c;
    }

    .error {
      color: #d00;
    }
  </style>
</head>

<body>
  <div class="box">
    <h1>🔗 Rút gọn link</h1>

    <input
      id="url"
      type="url"
      placeholder="Dán link dài vào đây..."
    >

    <button onclick="shorten()">Rút gọn</button>

    <div id="result"></div>
  </div>

  <script>
    async function shorten() {
      const input = document.getElementById("url");
      const result = document.getElementById("result");

      const url = input.value.trim();

      if (!url) {
        result.innerHTML = '<p class="error">Hãy nhập link.</p>';
        return;
      }

      result.textContent = "Đang tạo link...";

      try {
        const response = await fetch("/api/shorten", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ url })
        });

        const text = await response.text();

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          console.error("Server trả về:", text);
          throw new Error(
            "API không trả JSON. Hãy kiểm tra Worker."
          );
        }

        if (!response.ok) {
          throw new Error(data.error || "Có lỗi xảy ra.");
        }

        result.innerHTML = \`
          <p>Link ngắn:</p>
          <a href="\${data.shortUrl}" target="_blank">
            \${data.shortUrl}
          </a>
        \`;

      } catch (error) {
        result.innerHTML =
          '<p class="error">' +
          error.message +
          '</p>';
      }
    }
  </script>
</body>
</html>`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8"
    }
  });
}

function randomCode(length = 7) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }

  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API tạo link ngắn
    if (
      request.method === "POST" &&
      url.pathname === "/api/shorten"
    ) {
      try {
        const body = await request.json();
        const originalUrl = String(body.url || "").trim();

        if (!originalUrl) {
          return json(
            { error: "Thiếu URL." },
            400
          );
        }

        let parsed;

        try {
          parsed = new URL(originalUrl);
        } catch {
          return json(
            { error: "URL không hợp lệ." },
            400
          );
        }

        if (
          parsed.protocol !== "http:" &&
          parsed.protocol !== "https:"
        ) {
          return json(
            { error: "Chỉ hỗ trợ HTTP/HTTPS." },
            400
          );
        }

        let code;

        // Tránh trùng code
        for (let i = 0; i < 10; i++) {
          const candidate = randomCode(7);

          const exists = await env.DB
            .prepare(
              "SELECT id FROM links WHERE code = ? LIMIT 1"
            )
            .bind(candidate)
            .first();

          if (!exists) {
            code = candidate;
            break;
          }
        }

        if (!code) {
          return json(
            { error: "Không tạo được mã ngắn." },
            500
          );
        }

        await env.DB
          .prepare(
            "INSERT INTO links (code, url, created_at) VALUES (?, ?, ?)"
          )
          .bind(
            code,
            originalUrl,
            Date.now()
          )
          .run();

        const shortUrl =
          `${url.origin}/${code}`;

        return json({
          success: true,
          code,
          url: originalUrl,
          shortUrl
        });

      } catch (error) {
        return json(
          {
            error: error.message || "Server error"
          },
          500
        );
      }
    }

    // Link ngắn -> chuyển hướng
    if (
      request.method === "GET" &&
      /^\\/[A-Za-z0-9]{7}$/.test(url.pathname)
    ) {
      const code =
        url.pathname.substring(1);

      const row = await env.DB
        .prepare(
          "SELECT url FROM links WHERE code = ? LIMIT 1"
        )
        .bind(code)
        .first();

      if (!row) {
        return new Response(
          "Không tìm thấy link.",
          {
            status: 404,
            headers: {
              "Content-Type":
                "text/plain; charset=UTF-8"
            }
          }
        );
      }

      return Response.redirect(
        row.url,
        302
      );
    }

    // Trang chính
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return new Response(HTML, {
        headers: {
          "Content-Type":
            "text/html; charset=UTF-8"
        }
      });
    }

    return new Response("Not Found", {
      status: 404
    });
  }
};
