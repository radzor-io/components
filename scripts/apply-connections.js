#!/usr/bin/env node
// Apply connectsTo connections to component manifests
const fs = require('fs');
const path = require('path');

const CONNECTIONS = {
  "ab-test": [
    {"event": "onConversion", "description": "Track conversion events in analytics pipeline", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/funnel-report.action.recordStep.userId"]},
    {"output": "experimentResults", "compatibleWith": ["@radzor/csv-export.action.generate.data"], "mapField": "experimentId"}
  ],
  "agent-router": [
    {"output": "routeResult", "compatibleWith": ["@radzor/llm-completion.action.complete.prompt", "@radzor/structured-output.action.generate.prompt"], "mapField": "response"},
    {"event": "onFallback", "description": "Alert when routing falls back to default agent", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.warn.message"]}
  ],
  "ai-classifier": [
    {"output": "classificationResult", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"], "mapField": "category"},
    {"event": "onClassified", "description": "Route classified content to appropriate handler", "compatibleWith": ["@radzor/agent-router.action.route.prompt", "@radzor/notification-hub.action.send.body"]}
  ],
  "audio-mix": [
    {"output": "mixResult", "compatibleWith": ["@radzor/s3-upload.action.upload.key", "@radzor/file-upload.action.upload.data"], "mapField": "outputPath"},
    {"event": "onMixComplete", "description": "Upload mixed audio to cloud storage", "compatibleWith": ["@radzor/s3-upload.action.upload.key"]}
  ],
  "chatbot-flow": [
    {"output": "botResponse", "compatibleWith": ["@radzor/llm-completion.action.complete.prompt", "@radzor/realtime-chat.action.sendMessage.content"], "mapField": "message"},
    {"event": "onFlowComplete", "description": "Notify support team when chatbot flow completes", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/slack-bot.action.sendMessage.text"]},
    {"event": "onFallback", "description": "Escalate to LLM when no flow transition matches", "compatibleWith": ["@radzor/llm-completion.action.complete.prompt"]}
  ],
  "comment-system": [
    {"event": "onCommentAdded", "description": "Notify content owner of new comments", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/email-send.action.send.message", "@radzor/push-notification.action.sendToDevice.token"]},
    {"event": "onCommentModerated", "description": "Log moderation actions", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"]}
  ],
  "data-validator": [
    {"event": "onValidationFailed", "description": "Log validation failures for debugging", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.warn.message"]},
    {"output": "validationResult", "compatibleWith": ["@radzor/event-tracker.action.track.eventName"], "mapField": "valid"}
  ],
  "database-migrate": [
    {"event": "onMigrationComplete", "description": "Notify team after successful migration", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/notification-hub.action.send.body"]},
    {"event": "onMigrationFailed", "description": "Alert on migration failure", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/email-send.action.send.message", "@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "email-template": [
    {"output": "renderedHtml", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/pdf-generate.action.fromHtml.html"]},
    {"output": "renderedText", "compatibleWith": ["@radzor/sms-send.action.send.body", "@radzor/slack-bot.action.sendMessage.text"]}
  ],
  "email-verify": [
    {"output": "verificationResult", "compatibleWith": ["@radzor/email-send.action.send.message"], "mapField": "email"}
  ],
  "encryption": [
    {"output": "encryptedPayload", "compatibleWith": ["@radzor/kv-store.action.set.value", "@radzor/s3-upload.action.upload.body"], "mapField": "ciphertext"},
    {"output": "hashResult", "compatibleWith": ["@radzor/kv-store.action.set.value"]}
  ],
  "error-tracker": [
    {"output": "errorReport", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text"], "mapField": "message"},
    {"event": "onErrorCaptured", "description": "Route captured errors to notification channels", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text", "@radzor/email-send.action.send.message"]}
  ],
  "event-tracker": [
    {"event": "onFlush", "description": "Log batch flush results", "compatibleWith": ["@radzor/log-aggregator.action.info.message"]},
    {"output": "trackingResult", "compatibleWith": ["@radzor/log-aggregator.action.info.message"], "mapField": "eventCount"}
  ],
  "funnel-report": [
    {"output": "funnelReport", "compatibleWith": ["@radzor/csv-export.action.generate.data", "@radzor/slack-bot.action.sendMessage.text"], "mapField": "funnelId"}
  ],
  "graphql-client": [
    {"output": "graphqlResult", "compatibleWith": ["@radzor/json-transform.action.transform.data", "@radzor/data-validator.action.validate.data"], "mapField": "data"},
    {"event": "onError", "description": "Track GraphQL errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.error.message"]}
  ],
  "guardrails": [
    {"event": "onViolation", "description": "Alert on content policy violations", "compatibleWith": ["@radzor/log-aggregator.action.warn.message", "@radzor/error-tracker.action.captureMessage.message", "@radzor/slack-bot.action.sendMessage.text"]},
    {"output": "validationResult", "compatibleWith": ["@radzor/event-tracker.action.track.eventName"], "mapField": "passed"}
  ],
  "health-check": [
    {"event": "onUnhealthy", "description": "Alert when service dependencies are unhealthy", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text", "@radzor/email-send.action.send.message"]},
    {"output": "healthReport", "compatibleWith": ["@radzor/log-aggregator.action.info.message"], "mapField": "status"}
  ],
  "inbox-parser": [
    {"output": "parsedEmail", "compatibleWith": ["@radzor/ai-classifier.action.classify.text", "@radzor/llm-completion.action.complete.prompt"], "mapField": "text"}
  ],
  "invoice-generator": [
    {"output": "invoicePdf", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/s3-upload.action.upload.body"]},
    {"output": "invoiceData", "compatibleWith": ["@radzor/csv-export.action.generate.data"], "mapField": "invoiceNumber"}
  ],
  "ip-geolocation": [
    {"output": "geoResult", "compatibleWith": ["@radzor/event-tracker.action.track.properties", "@radzor/log-aggregator.action.info.message"], "mapField": "country"}
  ],
  "json-transform": [
    {"output": "transformedData", "compatibleWith": ["@radzor/data-validator.action.validate.data", "@radzor/csv-export.action.generate.data", "@radzor/embeddings-store.action.add.text"]}
  ],
  "jwt-auth": [
    {"output": "tokenPayload", "compatibleWith": ["@radzor/session-manager.action.create.data", "@radzor/rbac.action.checkPermission.userId"], "mapField": "sub"},
    {"event": "onExpired", "description": "Trigger token refresh on expiry", "compatibleWith": ["@radzor/oauth-token-refresh.action.refresh.refreshToken"]}
  ],
  "kv-store": [
    {"event": "onExpired", "description": "Log key expirations for debugging", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"]}
  ],
  "log-aggregator": [
    {"output": "logEntry", "compatibleWith": ["@radzor/search-index.action.index.documents"], "mapField": "message"},
    {"event": "onLog", "description": "Forward critical logs to alerting", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text"]}
  ],
  "nft-mint": [
    {"output": "mintResult", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text"], "mapField": "txHash"},
    {"event": "onMinted", "description": "Notify owner after NFT mint", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/notification-hub.action.send.body"]}
  ],
  "notification-hub": [
    {"event": "onFailed", "description": "Track failed notification deliveries", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.error.message"]},
    {"output": "deliveryReport", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"], "mapField": "channelName"}
  ],
  "payment-refund": [
    {"output": "refundResult", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/notification-hub.action.send.body"], "mapField": "id"},
    {"event": "onRefundCompleted", "description": "Notify customer of successful refund", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/slack-bot.action.sendMessage.text"]},
    {"event": "onRefundFailed", "description": "Alert on failed refund", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/slack-bot.action.sendMessage.text"]}
  ],
  "prompt-template": [
    {"output": "renderedPrompt", "compatibleWith": ["@radzor/llm-completion.action.complete.prompt", "@radzor/rag-pipeline.action.query.question", "@radzor/structured-output.action.generate.prompt"], "mapField": "text"}
  ],
  "rag-pipeline": [
    {"output": "ragResult", "compatibleWith": ["@radzor/guardrails.action.validateOutput.text", "@radzor/structured-output.action.extract.text"], "mapField": "answer"},
    {"event": "onQueryComplete", "description": "Log RAG queries for analysis", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]}
  ],
  "rbac": [
    {"event": "onAccessDenied", "description": "Log unauthorized access attempts", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.warn.message", "@radzor/event-tracker.action.track.eventName"]},
    {"output": "authorizationResult", "compatibleWith": ["@radzor/log-aggregator.action.info.message"], "mapField": "allowed"}
  ],
  "retry-handler": [
    {"event": "onExhausted", "description": "Alert when all retry attempts exhausted", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text"]},
    {"output": "retryResult", "compatibleWith": ["@radzor/log-aggregator.action.info.message"], "mapField": "attempts"}
  ],
  "rss-feed": [
    {"output": "feedData", "compatibleWith": ["@radzor/json-transform.action.transform.data", "@radzor/embeddings-store.action.add.text", "@radzor/search-index.action.index.documents"], "mapField": "title"},
    {"event": "onNewItem", "description": "Process new RSS items through AI or notify channels", "compatibleWith": ["@radzor/llm-completion.action.complete.prompt", "@radzor/slack-bot.action.sendMessage.text", "@radzor/notification-hub.action.send.body"]}
  ],
  "s3-upload": [
    {"output": "uploadResult", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/slack-bot.action.sendMessage.text", "@radzor/notification-hub.action.send.body"], "mapField": "url"},
    {"event": "onUploadComplete", "description": "Log upload completions", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"]}
  ],
  "saml-auth": [
    {"output": "samlUser", "compatibleWith": ["@radzor/session-manager.action.create.data", "@radzor/rbac.action.assignRole.userId"], "mapField": "nameId"},
    {"event": "onLoginSuccess", "description": "Create session after SAML login", "compatibleWith": ["@radzor/session-manager.action.create.data", "@radzor/event-tracker.action.track.eventName"]},
    {"event": "onLoginFailed", "description": "Track SAML login failures", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.warn.message"]}
  ],
  "sse-stream": [
    {"event": "onClientConnected", "description": "Log SSE client connections", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"]},
    {"event": "onClientDisconnected", "description": "Track client disconnections", "compatibleWith": ["@radzor/log-aggregator.action.info.message"]}
  ],
  "state-machine": [
    {"event": "onTransition", "description": "Track state transitions for audit trail", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"output": "machineState", "compatibleWith": ["@radzor/notification-hub.action.send.body"], "mapField": "current"}
  ],
  "subscription-billing": [
    {"event": "onPaymentFailed", "description": "Alert on failed subscription payment", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/slack-bot.action.sendMessage.text", "@radzor/notification-hub.action.send.body"]},
    {"output": "subscription", "compatibleWith": ["@radzor/invoice-generator.action.setCustomer.name", "@radzor/usage-metering.action.recordUsage.customerId"], "mapField": "customerId"},
    {"event": "onSubscriptionCancelled", "description": "Notify team of subscription cancellation", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/email-send.action.send.message"]}
  ],
  "token-swap": [
    {"output": "swapResult", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text"], "mapField": "txHash"},
    {"event": "onSwapCompleted", "description": "Notify on completed token swap", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/event-tracker.action.track.eventName"]}
  ],
  "uptime-monitor": [
    {"event": "onDown", "description": "Alert team when a monitored service goes down", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text", "@radzor/email-send.action.send.message", "@radzor/push-notification.action.sendToDevice.token"]},
    {"event": "onRecovered", "description": "Notify when service recovers", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/notification-hub.action.send.body"]},
    {"event": "onLatencySpike", "description": "Alert on latency spikes", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/log-aggregator.action.warn.message"]}
  ],
  "usage-metering": [
    {"event": "onThresholdReached", "description": "Alert customer when usage threshold reached", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text"]},
    {"output": "usageSummary", "compatibleWith": ["@radzor/invoice-generator.action.addLineItem.description", "@radzor/csv-export.action.generate.data"], "mapField": "meterId"}
  ],
  "user-segmentation": [
    {"output": "segmentResult", "compatibleWith": ["@radzor/ab-test.action.getVariant.userId", "@radzor/feature-flag.action.isEnabled.userId", "@radzor/notification-hub.action.send.recipient"], "mapField": "userId"}
  ],
  "video-transcode": [
    {"output": "transcodeResult", "compatibleWith": ["@radzor/s3-upload.action.upload.key", "@radzor/file-upload.action.upload.data"], "mapField": "outputPath"},
    {"event": "onTranscodeComplete", "description": "Upload transcoded video to storage", "compatibleWith": ["@radzor/s3-upload.action.upload.key", "@radzor/notification-hub.action.send.body"]},
    {"event": "onTranscodeFailed", "description": "Alert on transcode failure", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/slack-bot.action.sendMessage.text"]}
  ],
  "websocket-server": [
    {"event": "onConnection", "description": "Log new WebSocket connections", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"]},
    {"event": "onDisconnect", "description": "Track disconnections for analytics", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]}
  ],
  "whatsapp-send": [
    {"event": "onMessageDelivered", "description": "Track WhatsApp message delivery for analytics", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"output": "sendResult", "compatibleWith": ["@radzor/log-aggregator.action.info.message"], "mapField": "messageId"}
  ],
  "workflow-engine": [
    {"event": "onWorkflowFailed", "description": "Alert team on workflow failure", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/slack-bot.action.sendMessage.text", "@radzor/notification-hub.action.send.body"]},
    {"event": "onWorkflowComplete", "description": "Notify on workflow completion", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/email-send.action.send.message"]},
    {"output": "workflowResult", "compatibleWith": ["@radzor/csv-export.action.generate.data"], "mapField": "status"}
  ],
  "api-key-auth": [
    {"event": "onValidated", "description": "Log successful API key validations", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onRevoked", "description": "Notify when API key is revoked", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/log-aggregator.action.warn.message"]}
  ],
  "barcode-scan": [
    {"output": "barcodeBuffer", "compatibleWith": ["@radzor/s3-upload.action.upload.body", "@radzor/file-upload.action.upload.data"]},
    {"event": "onScanned", "description": "Process scanned barcode data", "compatibleWith": ["@radzor/search-index.action.search.query", "@radzor/event-tracker.action.track.eventName"]}
  ],
  "cache-store": [
    {"event": "onEvicted", "description": "Log cache evictions for capacity monitoring", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"]},
    {"event": "onMiss", "description": "Track cache misses for optimization", "compatibleWith": ["@radzor/event-tracker.action.track.eventName"]}
  ],
  "captcha-verify": [
    {"output": "verificationResult", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"], "mapField": "success"},
    {"event": "onFailed", "description": "Track CAPTCHA verification failures", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "circuit-breaker": [
    {"event": "onOpen", "description": "Alert when circuit breaker opens (service degraded)", "compatibleWith": ["@radzor/notification-hub.action.send.body", "@radzor/slack-bot.action.sendMessage.text", "@radzor/error-tracker.action.captureMessage.message"]},
    {"event": "onClose", "description": "Notify when circuit recovers", "compatibleWith": ["@radzor/slack-bot.action.sendMessage.text", "@radzor/log-aggregator.action.info.message"]}
  ],
  "email-send": [
    {"output": "sendResult", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"], "mapField": "id"},
    {"event": "onError", "description": "Track email delivery failures", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/notification-hub.action.send.body"]}
  ],
  "feature-flag": [
    {"event": "onFlagEnabled", "description": "Track feature flag evaluations", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onOverride", "description": "Audit feature flag overrides", "compatibleWith": ["@radzor/log-aggregator.action.warn.message", "@radzor/event-tracker.action.track.eventName"]}
  ],
  "file-upload": [
    {"output": "uploadResult", "compatibleWith": ["@radzor/email-send.action.send.message", "@radzor/slack-bot.action.sendMessage.text"], "mapField": "url"},
    {"event": "onComplete", "description": "Notify on upload completion", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]}
  ],
  "http-client": [
    {"event": "onError", "description": "Track HTTP client errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.error.message"]},
    {"event": "onRetry", "description": "Log HTTP request retries", "compatibleWith": ["@radzor/log-aggregator.action.warn.message"]}
  ],
  "oauth-token-refresh": [
    {"output": "tokenMeta", "compatibleWith": ["@radzor/session-manager.action.create.data", "@radzor/kv-store.action.set.value"], "mapField": "accessToken"},
    {"event": "onExpired", "description": "Alert on token expiration", "compatibleWith": ["@radzor/log-aggregator.action.warn.message"]}
  ],
  "password-hash": [
    {"output": "hashResult", "compatibleWith": ["@radzor/kv-store.action.set.value"]},
    {"event": "onError", "description": "Track hashing errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "push-notification": [
    {"event": "onSent", "description": "Track push notification delivery", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onError", "description": "Track push notification failures", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "queue-worker": [
    {"event": "onJobFailed", "description": "Alert on job processing failure", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/slack-bot.action.sendMessage.text", "@radzor/notification-hub.action.send.body"]},
    {"event": "onJobComplete", "description": "Log job completions", "compatibleWith": ["@radzor/log-aggregator.action.info.message", "@radzor/event-tracker.action.track.eventName"]}
  ],
  "rate-limiter": [
    {"event": "onBlocked", "description": "Log rate-limited requests for security monitoring", "compatibleWith": ["@radzor/log-aggregator.action.warn.message", "@radzor/event-tracker.action.track.eventName"]},
    {"output": "rateLimitResult", "compatibleWith": ["@radzor/log-aggregator.action.info.message"], "mapField": "allowed"}
  ],
  "reddit-post": [
    {"event": "onPostCreated", "description": "Track Reddit post creation", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/slack-bot.action.sendMessage.text"]},
    {"event": "onError", "description": "Track Reddit posting errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "session-manager": [
    {"event": "onCreated", "description": "Track new sessions for analytics", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onExpired", "description": "Log session expirations", "compatibleWith": ["@radzor/log-aggregator.action.info.message"]}
  ],
  "slack-bot": [
    {"event": "onError", "description": "Track Slack bot errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/log-aggregator.action.error.message"]},
    {"output": "messageResult", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"], "mapField": "channel"}
  ],
  "smart-contract": [
    {"event": "onCallResult", "description": "Log smart contract call results", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onError", "description": "Track smart contract errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message", "@radzor/notification-hub.action.send.body"]}
  ],
  "sms-send": [
    {"event": "onSent", "description": "Track SMS delivery for analytics", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onError", "description": "Track SMS delivery failures", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "telegram-bot": [
    {"event": "onMessageSent", "description": "Track Telegram message delivery", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onError", "description": "Track Telegram bot errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "twitter-post": [
    {"output": "tweetResult", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/slack-bot.action.sendMessage.text"], "mapField": "tweetId"},
    {"event": "onError", "description": "Track Twitter posting errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "video-call": [
    {"event": "onCallEnded", "description": "Track call duration for analytics", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onError", "description": "Track video call errors", "compatibleWith": ["@radzor/error-tracker.action.captureMessage.message"]}
  ],
  "wallet-connect": [
    {"event": "onConnected", "description": "Log wallet connections", "compatibleWith": ["@radzor/event-tracker.action.track.eventName", "@radzor/log-aggregator.action.info.message"]},
    {"event": "onDisconnected", "description": "Track wallet disconnections", "compatibleWith": ["@radzor/log-aggregator.action.info.message"]}
  ]
};

const componentsDir = path.resolve(__dirname, '..');
let updated = 0;
let errors = 0;

for (const [slug, connectsTo] of Object.entries(CONNECTIONS)) {
  const manifestPath = path.join(componentsDir, slug, 'radzor.manifest.json');
  
  if (!fs.existsSync(manifestPath)) {
    console.error(`✗ ${slug}: manifest not found at ${manifestPath}`);
    errors++;
    continue;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    
    // Merge with existing connectsTo (don't overwrite)
    const existing = manifest.composability?.connectsTo || [];
    manifest.composability = { connectsTo: [...existing, ...connectsTo] };
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`✓ ${slug}: added ${connectsTo.length} connections (total: ${manifest.composability.connectsTo.length})`);
    updated++;
  } catch (e) {
    console.error(`✗ ${slug}: ${e.message}`);
    errors++;
  }
}

console.log(`\nDone: ${updated} manifests updated, ${errors} errors`);
