exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "API token not configured" }) };
  }

  const { prompt, negative_prompt } = JSON.parse(event.body);

  try {
    const startRes = await fetch("https://api.replicate.com/v1/models/stability-ai/sdxl/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REPLICATE_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt: prompt,
          negative_prompt: negative_prompt || "blurry, low quality, watermark, text, deformed, ugly",
          num_inference_steps: 30,
          guidance_scale: 7.5,
          width: 1024,
          height: 1024,
        },
      }),
    });

    const prediction = await startRes.json();
    if (prediction.error) {
      return { statusCode: 400, body: JSON.stringify({ error: prediction.error }) };
    }

    if (prediction.status === "succeeded" && prediction.output) {
      return { statusCode: 200, body: JSON.stringify({ imageUrl: prediction.output[0] }) };
    }

    const predId = prediction.id;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predId}`, {
        headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      });
      const poll = await pollRes.json();
      if (poll.status === "succeeded" && poll.output) {
        return { statusCode: 200, body: JSON.stringify({ imageUrl: poll.output[0] }) };
      }
      if (poll.status === "failed") {
        return { statusCode: 500, body: JSON.stringify({ error: "Generation failed" }) };
      }
    }

    return { statusCode: 504, body: JSON.stringify({ error: "Timeout — please try again" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
