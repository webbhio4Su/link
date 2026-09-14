const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",
        ...corsHeaders
      }
    }
  );
}


function randomCode(length = 7) {

  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  const bytes =
    new Uint8Array(length);

  crypto.getRandomValues(bytes);

  let code = "";

  for (let i = 0; i < length; i++) {
    code +=
      chars[bytes[i] % chars.length];
  }

  return code;
}


async function createCode(env) {

  for (let i = 0; i < 20; i++) {

    const code =
      randomCode(7);

    const exists =
      await env.DB
        .prepare(
          "SELECT id FROM links WHERE code = ? LIMIT 1"
        )
        .bind(code)
        .first();

    if (!exists) {
      return code;
    }
  }

  throw new Error(
    "Không thể tạo mã."
  );
}


export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);


    // ================================================
    // CORS PREFLIGHT
    // ================================================

    if (request.method === "OPTIONS") {

      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });

    }


    // ================================================
    // API TEST
    // ================================================

    if (
      request.method === "GET" &&
      url.pathname === "/api"
    ) {

      return json({
        success: true,
        message:
          "Link Shortener API đang hoạt động."
      });

    }


    // ================================================
    // CREATE SHORT LINK
    // ================================================

    if (
      request.method === "POST" &&
      url.pathname === "/api/shorten"
    ) {

      try {

        const body =
          await request.json();

        const originalUrl =
          String(
            body.url || ""
          ).trim();


        if (!originalUrl) {

          return json({
            success: false,
            error: "Thiếu URL."
          }, 400);

        }


        let parsedUrl;

        try {

          parsedUrl =
            new URL(originalUrl);

        } catch {

          return json({
            success: false,
            error: "URL không hợp lệ."
          }, 400);

        }


        if (
          parsedUrl.protocol !== "http:" &&
          parsedUrl.protocol !== "https:"
        ) {

          return json({
            success: false,
            error:
              "Chỉ hỗ trợ HTTP và HTTPS."
          }, 400);

        }


        // Tạo code
        const code =
          await createCode(env);


        // Lưu database
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


        // Link ngắn
        const shortUrl =
          `${url.origin}/${code}`;


        return json({

          success: true,

          code: code,

          url: originalUrl,

          shortUrl: shortUrl

        });


      } catch (error) {

        return json({

          success: false,

          error:
            error.message ||
            "Server error."

        }, 500);

      }

    }


    // ================================================
    // REDIRECT SHORT LINK
    // ================================================

    if (
      request.method === "GET" &&
      /^\/[A-Za-z0-9]{7}$/.test(
        url.pathname
      )
    ) {

      const code =
        url.pathname.substring(1);


      const row =
        await env.DB
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
            headers: corsHeaders
          }
        );

      }


      return Response.redirect(
        row.url,
        302
      );

    }


    // ================================================
    // ROOT
    // ================================================

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {

      return new Response(`
<!DOCTYPE html>

<html lang="vi">

<head>

<meta charset="UTF-8">

<title>Link Shortener API</title>

</head>

<body style="
font-family:Arial;
text-align:center;
padding:50px;
">

<h1>Link Shortener API</h1>

<p>API đang hoạt động.</p>

<p>GET /api</p>

<p>POST /api/shorten</p>

</body>

</html>
      `, {

        status: 200,

        headers: {
          "Content-Type":
            "text/html; charset=UTF-8",

          ...corsHeaders
        }

      });

    }


    // ================================================
    // NOT FOUND
    // ================================================

    return new Response(
      "Not Found",
      {
        status: 404,
        headers: corsHeaders
      }
    );

  }

};
