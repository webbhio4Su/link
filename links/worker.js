const CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateCode(length = 7) {
  let code = "";

  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }

  return code;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // =========================
    // TẠO LINK NGẮN
    // =========================

    if (
      request.method === "POST" &&
      url.pathname === "/api/shorten"
    ) {

      let body;

      try {
        body = await request.json();
      } catch {
        return json({
          error: "Dữ liệu gửi lên không hợp lệ."
        }, 400);
      }

      const originalUrl =
        String(body?.url || "").trim();

      if (!originalUrl) {
        return json({
          error: "Chưa nhập URL."
        }, 400);
      }

      let parsed;

      try {
        parsed = new URL(originalUrl);
      } catch {
        return json({
          error: "URL không hợp lệ."
        }, 400);
      }

      if (
        parsed.protocol !== "http:" &&
        parsed.protocol !== "https:"
      ) {
        return json({
          error: "Chỉ hỗ trợ HTTP và HTTPS."
        }, 400);
      }

      let code;

      for (let i = 0; i < 20; i++) {

        const newCode = generateCode(7);

        const exists = await env.DB
          .prepare(
            "SELECT code FROM links WHERE code = ? LIMIT 1"
          )
          .bind(newCode)
          .first();

        if (!exists) {
          code = newCode;
          break;
        }
      }

      if (!code) {
        return json({
          error: "Không thể tạo mã ngắn."
        }, 500);
      }

      await env.DB
        .prepare(`
          INSERT INTO links
          (code, url, created_at)
          VALUES (?, ?, ?)
        `)
        .bind(
          code,
          originalUrl,
          Date.now()
        )
        .run();

      return json({
        success: true,
        code,
        shortUrl: `${url.origin}/${code}`
      });
    }

    // =========================
    // REDIRECT LINK NGẮN
    // =========================

    if (
      request.method === "GET" &&
      url.pathname !== "/" &&
      !url.pathname.startsWith("/api/")
    ) {

      const code =
        url.pathname.slice(1);

      if (/^[A-Za-z0-9]{7}$/.test(code)) {

        const link = await env.DB
          .prepare(`
            SELECT url
            FROM links
            WHERE code = ?
            LIMIT 1
          `)
          .bind(code)
          .first();

        if (link) {
          return Response.redirect(
            link.url,
            302
          );
        }

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
    }

    // =========================
    // TRANG CHỦ
    // =========================

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {

      return new Response(
        `<!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport"
                content="width=device-width,initial-scale=1">
          <title>LinkShort</title>
        </head>

        <body>

          <h1>LinkShort</h1>

          <input
            id="url"
            type="url"
            placeholder="https://example.com/..."
          >

          <button onclick="shorten()">
            Rút gọn
          </button>

          <p id="result"></p>

          <script>
            async function shorten() {

              const url =
                document.getElementById("url").value.trim();

              const result =
                document.getElementById("result");

              try {

                const response =
                  await fetch("/api/shorten", {
                    method: "POST",
                    headers: {
                      "Content-Type":
                        "application/json"
                    },
                    body: JSON.stringify({
                      url: url
                    })
                  });

                const text =
                  await response.text();

                let data;

                try {
                  data = JSON.parse(text);
                } catch {
                  throw new Error(
                    "Server không trả về JSON. Kiểm tra Worker/API."
                  );
                }

                if (!response.ok) {
                  throw new Error(
                    data.error || "Có lỗi xảy ra."
                  );
                }

                result.innerHTML =
                  '<a href="' +
                  data.shortUrl +
                  '" target="_blank">' +
                  data.shortUrl +
                  '</a>';

              } catch (error) {

                result.textContent =
                  error.message;

              }

            }
          </script>

        </body>
        </html>`,
        {
          headers: {
            "Content-Type":
              "text/html; charset=UTF-8"
          }
        }
      );
    }

    return new Response(
      "Not Found",
      { status: 404 }
    );
  }
};
