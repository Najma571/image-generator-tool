exports.handler = async function (event) {
  // ✅ Only POST allowed
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  // ✅ Token check
  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API token not configured" }),
    };
  }

  try {
    // ✅ Safe body parse
    const body = event.body ? JSON.parse(event.body) : {};
    const prompt = body.prompt;

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prompt is required" }),
      };
    }

    const negative_prompt =
      body.negative_prompt ||
      "blurry, low quality, watermark, text, deformed, ugly";

    // ✅ Create prediction (UPDATED endpoint)
    const startRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        version: "stability-ai/sdxl", // simple usage
        input: {
          prompt: prompt,
          negative_prompt: negative_prompt,
          width: 1024,
          height: 1024,
          num_inference_steps: 30,
          guidance_scale: 7.5,
        },
      }),
    });

    const prediction = await startRes.json();

    if (!startRes.ok) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: prediction.detail || "Failed to start generation",
        }),
      };
    }

    // ✅ If instantly ready
    if (prediction.status === "succeeded" && prediction.output) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          imageUrl: prediction.output[0],
        }),
      };
    }

    // ⏳ Polling
    const predId = prediction.id;

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${predId}`,
        {
          headers: {
            Authorization: `Bearer ${REPLICATE_TOKEN}`,
          },
        }
      );

      const poll = await pollRes.json();

      if (poll.status === "succeeded" && poll.output) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            imageUrl: poll.output[0],
          }),
        };
      }

      if (poll.status === "failed") {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "Image generation failed" }),
        };
      }
    }

    // ⏰ Timeout
    return {
      statusCode: 504,
      body: JSON.stringify({ error: "Timeout — try again" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || "Server error",
      }),
    };
  }
};
