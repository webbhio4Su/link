import html from "./index.html";

const CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateCode(length = 7) {

  let code = "";

  for (let i = 0; i < length; i++) {
    code += CHARS[
      Math.floor(Math.random() * CHARS.length)
    ];
  }

  return code;
}

async function createCode(env) {

  for (let i = 0; i < 10; i++) {

    const code = generateCode(7);

    const exists = await env.DB
      .prepare(
        "SELECT code FROM links WHERE code = ?"
      )
      .bind(code)
      .first();

    if (!exists) {
      return code;
    }
  }

  throw new Error("Không thể tạo mã.");
}

export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    /*
     * API tạo link
     */

    if (
      request.method === "POST" &&
      url.pathname === "/api/shorten"
    ) {

      try {

        const body = await request.json();

        const originalUrl =
          String(body.url || "").trim();

        let parsed;

        try {
          parsed = new URL(originalUrl);
        } catch {
          return Response.json(
            { error: "URL không hợp lệ." },
            { status: 400 }
          );
        }

        if (
          parsed.protocol !== "http:" &&
          parsed.protocol !== "https:"
        ) {
          return Response.json(
            { error: "Chỉ hỗ trợ HTTP và HTTPS." },
            { status: 400 }
          );
        }

        const code = await createCode(env);

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

        return Response.json({
          code: code,
          shortUrl:
            `${url.origin}/${code}`
        });

      } catch (error) {

        return Response.json(
          {
            error: "Lỗi máy chủ."
          },
          {
            status: 500
          }
        );

      }
    }

    /*
     * Link ngắn
     */

    if (
      request.method === "GET" &&
      url.pathname !== "/" &&
      !url.pathname.startsWith("/api/")
    ) {

      const code =
        url.pathname.slice(1);

      if (
        code &&
        /^[A-Za-z0-9]{7}$/.test(code)
      ) {

        const result =
          await env.DB
            .prepare(`
              SELECT url
              FROM links
              WHERE code = ?
              LIMIT 1
            `)
            .bind(code)
            .first();

        if (result) {

          return Response.redirect(
            result.url,
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

    /*
     * Trang chủ
     */

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {

      return new Response(
        html,
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
      {
        status: 404
      }
    );
  }
};
