const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type"
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


    /*
      CORS
    */

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders
        }
      );

    }


    /*
      API: tạo link ngắn
    */

    if (
      request.method === "POST" &&
      url.pathname === "/api/shorten"
    ) {

      try {

        const body =
          await request.json();

        const originalUrl =
          String(body.url || "").trim();


        if (!originalUrl) {

          return json(
            {
              error:
                "Thiếu URL."
            },
            400
          );

        }


        let parsedUrl;


        try {

          parsedUrl =
            new URL(originalUrl);

        } catch {

          return json(
            {
              error:
                "URL không hợp lệ."
            },
            400
          );

        }


        if (
          parsedUrl.protocol !== "http:" &&
          parsedUrl.protocol !== "https:"
        ) {

          return json(
            {
              error:
                "Chỉ hỗ trợ HTTP và HTTPS."
            },
            400
          );

        }


        const code =
          await createCode(env);


        await env.DB
          .prepare(
            `INSERT INTO links
             (code, url, created_at)
             VALUES (?, ?, ?)`
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
          code: code,
          url: originalUrl,
          shortUrl: shortUrl
        });


      } catch (error) {

        return json(
          {
            error:
              error.message ||
              "Server error."
          },
          500
        );

      }

    }


    /*
      Link ngắn:
      /Ab12Cd3
    */

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


    /*
      Trang API kiểm tra
    */

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


    /*
      Trang chủ Worker
    */

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {

      return new Response(
        `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Link Shortener API</title>
</head>

<body
style="
font-family:Arial;
padding:40px;
text-align:center;
"
>

<h1>Link Shortener API</h1>

<p>API đang hoạt động.</p>

<p>
POST /api/shorten
</p>

</body>
</html>
        `,
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
