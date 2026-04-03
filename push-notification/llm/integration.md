# push-notification — Integration Guide

## Overview

Send push notifications to mobile devices via Firebase Cloud Messaging (FCM) or Apple Push Notification service (APNs).

## Installation

```bash
radzor add push-notification
```

## Configuration

| Input         | Type   | Required | Description                               |
| ------------- | ------ | -------- | ----------------------------------------- |
| `provider`    | string | yes      | `"fcm"` or `"apns"`                       |
| `credentials` | object | yes      | Provider-specific credentials (see below) |

### FCM Credentials

| Field       | Type   | Description              |
| ----------- | ------ | ------------------------ |
| `serverKey` | string | FCM server key           |

### APNs Credentials

| Field        | Type    | Description                     |
| ------------ | ------- | ------------------------------- |
| `keyId`      | string  | APNs key ID                     |
| `teamId`     | string  | Apple Team ID                   |
| `privateKey` | string  | APNs private key (PEM)          |
| `bundleId`   | string  | App bundle identifier           |
| `production` | boolean | Use production APNs (default: false) |

## Quick Start

### TypeScript

```typescript
import { PushNotification } from "./components/push-notification/src";

const push = new PushNotification({
  provider: "fcm",
  credentials: { serverKey: process.env.FCM_SERVER_KEY! },
});

await push.sendToDevice("device-token", {
  title: "New Message",
  body: "You have a new notification",
});
```

### Python

```python
from components.push_notification.src import PushNotification, FcmCredentials, PushPayload

push = PushNotification("fcm", FcmCredentials(server_key=os.environ["FCM_SERVER_KEY"]))
push.send_to_device("device-token", PushPayload(title="New Message", body="You have a new notification"))
```

## Actions

### sendToDevice / send_to_device

Send a notification to a specific device token. Works with both FCM and APNs.

### sendToTopic / send_to_topic

Send a notification to all subscribers of a topic. FCM only.

## Requirements

- FCM server key or APNs credentials
- No external dependencies — uses stdlib only
