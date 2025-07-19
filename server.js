require("dotenv").config();

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("chat message", async (msg) => {
    if (msg.trim().length > 0) {
      const userInput = msg.startsWith("user:") ? msg.slice(5).trim() : msg.trim();

      const models = [
        "moonshotai/kimi-k2:free",
        "mistralai/mistral-7b-instruct:free",
        "google/gemma-7b-it:free",
      ];

      let aiReply = "🤖 Sorry, no reply.";
      let success = false;

      for (const model of models) {
        try {
          const response = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: userInput },
              ],
            }),
          });

          const text = await response.text();

          let data;
          try {
            data = JSON.parse(text);
          } catch (err) {
            console.error(`Invalid JSON from model ${model}:\n`, text);
            aiReply = "🤖 Model returned invalid response format.";
            continue;
          }

          console.log(
            `OpenRouter response (${model}):\n`,
            JSON.stringify(data, null, 2)
          );

          if (data.choices?.[0]?.message?.content) {
            aiReply = `🤖 ${data.choices[0].message.content}`;
            success = true;
            break;
          } else if (data.error) {
            if (
              data.error.code === 429 ||
              (data.error.metadata?.raw && data.error.metadata.raw.includes("rate-limited"))
            ) {
              console.warn(`Rate limited on ${model}, trying next model...`);
              continue;
            } else {
              aiReply = `🤖 Error from ${model}: ${data.error.message}`;
              break;
            }
          } else {
            aiReply = "🤖 Unexpected response format.";
            break;
          }
        } catch (err) {
          console.error(`Error with model ${model}:`, err);
          continue;
        }
      }

      socket.emit("chat message", aiReply); 
    } else {
      socket.emit("chat message", msg);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
