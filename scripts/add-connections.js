#!/usr/bin/env node
/**
 * Batch-add composability connections to manifests.
 * Run once, then delete this file.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function update(slug, newConnections) {
  const fp = path.join(ROOT, slug, "radzor.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(fp, "utf-8"));

  if (!manifest.composability) manifest.composability = {};
  if (!manifest.composability.connectsTo) manifest.composability.connectsTo = [];

  // Merge: add connections that don't already exist (by output/event + compatibleWith combo)
  for (const conn of newConnections) {
    const key = conn.output || conn.event;
    const exists = manifest.composability.connectsTo.some(c => {
      const cKey = c.output || c.event;
      return cKey === key && JSON.stringify(c.compatibleWith) === JSON.stringify(conn.compatibleWith);
    });
    if (!exists) {
      manifest.composability.connectsTo.push(conn);
    }
  }

  fs.writeFileSync(fp, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ✓ ${slug}: ${manifest.composability.connectsTo.length} connections total`);
}

console.log("Adding composability connections...\n");

// === SCENARIO 1: Stripe + Webhook + Email ===

update("stripe-checkout", [
  {
    event: "onPaymentSuccess",
    compatibleWith: [
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/push-notification.action.sendToDevice.notification",
      "@radzor/sms-send.action.send.body"
    ],
    description: "Notify customer and team when payment succeeds."
  },
  {
    event: "onPaymentFailed",
    compatibleWith: [
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.sendMessage.text"
    ],
    description: "Alert on payment failure."
  },
  {
    event: "onSubscriptionCreated",
    compatibleWith: [
      "@radzor/email-send.action.send.message"
    ],
    description: "Send welcome email for new subscribers."
  },
  {
    event: "onSubscriptionCanceled",
    compatibleWith: [
      "@radzor/email-send.action.send.message"
    ],
    description: "Send cancellation confirmation."
  },
  {
    output: "checkoutSession",
    compatibleWith: [
      "@radzor/pdf-generate.action.fromTemplate.data"
    ],
    description: "Generate invoice/receipt PDF from checkout session data.",
    mapField: "id"
  }
]);

update("webhook-receiver", [
  {
    output: "verifiedPayload",
    compatibleWith: [
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/event-bus.action.publish.payload",
      "@radzor/background-job.action.enqueue.payload",
      "@radzor/push-notification.action.sendToDevice.notification"
    ],
    mapField: "data",
    description: "Route verified webhook events to notifications or async processing."
  }
]);

// === SCENARIO 4: Multi-Channel Alerts ===

update("event-bus", [
  {
    output: "publishResult",
    compatibleWith: [
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/email-send.action.send.message",
      "@radzor/push-notification.action.sendToDevice.notification",
      "@radzor/sms-send.action.send.body",
      "@radzor/discord-bot.action.sendMessage.content",
      "@radzor/telegram-bot.action.sendMessage.text"
    ],
    description: "Fan-out internal events to notification channels."
  },
  {
    output: "publishResult",
    compatibleWith: [
      "@radzor/background-job.action.enqueue.payload"
    ],
    description: "Queue events for async processing."
  }
]);

update("background-job", [
  {
    event: "onJobFailed",
    compatibleWith: [
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/email-send.action.send.message"
    ],
    description: "Alert team when a background job fails."
  },
  {
    event: "onJobCompleted",
    compatibleWith: [
      "@radzor/email-send.action.send.message"
    ],
    description: "Notify on job completion."
  }
]);

update("cron-scheduler", [
  {
    event: "onJobComplete",
    compatibleWith: [
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/email-send.action.send.message"
    ],
    description: "Report scheduled job results."
  },
  {
    event: "onJobError",
    compatibleWith: [
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/email-send.action.send.message"
    ],
    description: "Alert on cron job failure."
  }
]);

// === SCENARIO 5: Scrape → CSV ===

update("web-scraper", [
  {
    output: "scrapeResult",
    compatibleWith: [
      "@radzor/csv-export.action.generate.data",
      "@radzor/pdf-generate.action.fromHtml.html"
    ],
    mapField: "data",
    description: "Export scraped data to CSV or generate PDF from HTML."
  }
]);

// === DENSIFY: LLM-Completion (core hub) ===

update("llm-completion", [
  {
    output: "completionResult",
    compatibleWith: [
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/discord-bot.action.sendMessage.content",
      "@radzor/telegram-bot.action.sendMessage.text",
      "@radzor/sms-send.action.send.body",
      "@radzor/push-notification.action.sendToDevice.notification"
    ],
    mapField: "content",
    description: "Send LLM-generated text to any notification channel."
  },
  {
    output: "completionResult",
    compatibleWith: [
      "@radzor/image-generation.action.generate.prompt"
    ],
    mapField: "content",
    description: "Use LLM output as image generation prompt."
  },
  {
    output: "completionResult",
    compatibleWith: [
      "@radzor/pdf-generate.action.fromHtml.html",
      "@radzor/search-index.action.index.documents",
      "@radzor/embeddings-store.action.add.text"
    ],
    mapField: "content",
    description: "Persist or render LLM output."
  }
]);

// === DENSIFY: Function-Calling ===

update("function-calling", [
  {
    output: "finalResponse",
    compatibleWith: [
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/text-to-speech.action.synthesize.text",
      "@radzor/structured-output.action.extract.text",
      "@radzor/markdown-render.action.render.markdown"
    ],
    description: "Route agent's final response to notifications, TTS, or structured extraction."
  }
]);

// === DENSIFY: Structured-Output ===

update("structured-output", [
  {
    output: "parsedResult",
    compatibleWith: [
      "@radzor/csv-export.action.generate.data",
      "@radzor/email-send.action.send.message",
      "@radzor/search-index.action.index.documents",
      "@radzor/slack-bot.action.sendMessage.text"
    ],
    description: "Export or share structured extraction results."
  }
]);

// === DENSIFY: Document-OCR ===

update("document-ocr", [
  {
    output: "extractionResult",
    compatibleWith: [
      "@radzor/structured-output.action.extract.text"
    ],
    mapField: "text",
    description: "Extract structured fields (invoices, forms) from OCR'd text."
  },
  {
    output: "structuredData",
    compatibleWith: [
      "@radzor/csv-export.action.generate.data"
    ],
    description: "Export OCR'd tables directly to CSV."
  }
]);

// === DENSIFY: CSV-Import ===

update("csv-import", [
  {
    output: "rows",
    compatibleWith: [
      "@radzor/embeddings-store.action.add.text",
      "@radzor/search-index.action.index.documents",
      "@radzor/llm-completion.action.complete.prompt",
      "@radzor/csv-export.action.generate.data"
    ],
    description: "Feed imported CSV data to embeddings, search, LLM analysis, or re-export."
  }
]);

// === DENSIFY: Auth chains ===

update("auth-oauth", [
  {
    event: "onLogin",
    compatibleWith: [
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/event-bus.action.publish.payload"
    ],
    description: "Notify on new user login/signup."
  }
]);

// === DENSIFY: Chat → AI ===

update("realtime-chat", [
  {
    event: "onMessage",
    compatibleWith: [
      "@radzor/llm-completion.action.complete.prompt",
      "@radzor/structured-output.action.extract.text"
    ],
    description: "Feed chat messages to LLM for AI chatbot or structured extraction."
  }
]);

// === DENSIFY: GitHub → notifications ===

update("github-bot", [
  {
    event: "onIssueCreated",
    compatibleWith: [
      "@radzor/slack-bot.action.sendMessage.text",
      "@radzor/email-send.action.send.message",
      "@radzor/llm-completion.action.complete.prompt"
    ],
    description: "Notify team or auto-triage issues with LLM."
  }
]);

// === DENSIFY: File generation → upload/share ===

update("screenshot", [
  {
    output: "screenshotBuffer",
    compatibleWith: [
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.uploadFile.content",
      "@radzor/image-resize.action.resize.input",
      "@radzor/image-transform.action.resize.input"
    ],
    description: "Share, email, or transform screenshots."
  }
]);

update("image-generation", [
  {
    output: "generationResult",
    compatibleWith: [
      "@radzor/image-resize.action.resize.input",
      "@radzor/email-send.action.send.message",
      "@radzor/slack-bot.action.uploadFile.content",
      "@radzor/telegram-bot.action.sendPhoto.photo"
    ],
    description: "Process, share, or send AI-generated images."
  }
]);

update("markdown-render", [
  {
    output: "html",
    compatibleWith: [
      "@radzor/pdf-generate.action.fromHtml.html",
      "@radzor/email-send.action.send.message"
    ],
    description: "Convert rendered HTML to PDF or email it."
  }
]);

update("zip-archive", [
  {
    output: "archiveBuffer",
    compatibleWith: [
      "@radzor/file-upload.action.upload.data",
      "@radzor/email-send.action.send.message"
    ],
    description: "Upload or email ZIP archives."
  }
]);

update("qr-code", [
  {
    output: "qrBuffer",
    compatibleWith: [
      "@radzor/file-upload.action.upload.data",
      "@radzor/email-send.action.send.message"
    ],
    description: "Upload or email QR codes."
  }
]);

// === DENSIFY: Search ===

update("search-index", [
  {
    output: "searchResults",
    compatibleWith: [
      "@radzor/llm-completion.action.complete.prompt",
      "@radzor/csv-export.action.generate.data"
    ],
    description: "Feed search results to LLM or export them."
  }
]);

console.log("\nDone!");
