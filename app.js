require("dotenv").config();
const express = require("express");
const OpenAI = require("openai");
const twilio = require("twilio");
const trainingData = require("./trainingData"); // Import the training data

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const conversationHistory = {};

// Function to add messages to the conversation history
const addToConversationHistory = (from, role, content) => {
  if (!conversationHistory[from]) {
    conversationHistory[from] = [...trainingData]; // Start with the training data for new conversations
  }
  conversationHistory[from].push({ role, content });
};

// Twilio setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.post("/send-message", async (req, res) => {
  const { phoneNumber, message } = req.body;

  try {
    // Add the user's message to the conversation history
    addToConversationHistory(phoneNumber, "user", message);

    // Generate response from OpenAI using the conversation history
    const openaiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory[phoneNumber],
      max_tokens: 500,
    });

    const reply = openaiResponse?.choices?.[0]?.message?.content;

    // Check if the reply is valid
    if (!reply) {
      throw new Error("Received null or undefined content from OpenAI");
    }

    // Add the assistant's reply to the conversation history
    addToConversationHistory(phoneNumber, "assistant", reply);

    // Send message via Twilio
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${phoneNumber}`,
      body: reply,
    });

    res.status(200).send("Message sent successfully!");
  } catch (error) {
    console.error("Error:", error.response ? error.response.data : error.message);
    res.status(500).send("Failed to send message");
  }
});

app.post("/whatsapp-webhook", async (req, res) => {
  const incomingMessage = req.body.Body; // The message text from the user
  const from = req.body.From; // The phone number of the sender
  console.log("Incoming message:", incomingMessage);
  console.log("From:", from);

  try {
    // Add user's message to the conversation history
    addToConversationHistory(from, "user", incomingMessage);

    // Generate a response using OpenAI with the conversation history
    const openaiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversationHistory[from],
      max_tokens: 500,
    });

    console.log("OpenAI Response:", JSON.stringify(openaiResponse, null, 2));

    const reply =
      openaiResponse?.choices?.[0]?.message?.content ||
      "Sorry, I couldn't generate a response. Can you try rephrasing?";

    // Check if the reply is valid
    if (!reply) {
      throw new Error("Received null or undefined content from OpenAI");
    }

    // Add the assistant's reply to the conversation history
    addToConversationHistory(from, "assistant", reply);

    // Send the response back to the user via WhatsApp
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: from,
      body: reply,
    });

    res.status(200).send("Message processed successfully");
  } catch (error) {
    console.error("Error processing incoming message:", error.response ? error.response.data : error.message);
    res.status(500).send("Failed to process message");
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
