import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();

setGlobalOptions({maxInstances: 10, region: "us-central1"});

export const sendPushNotification = onRequest(async (req, res) => {
  // CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    res.status(204).send("");
    return;
  }

  try {
    const {token, topic, title, body} = req.body as {
      token?: string;
      topic?: string;
      title: string;
      body: string;
    };

    if (!title || !body) {
      res.status(400).json({error: "Missing required fields: title, body"});
      return;
    }

    let response: string;

    if (topic) {
      const message: admin.messaging.TopicMessage = {
        topic,
        notification: {title, body},
        data: {
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          id: "worker_notification",
        },
        apns: {
          payload: {aps: {sound: "default"}},
        },
      };
      logger.info(`Sending FCM to topic: ${topic}`);
      response = await admin.messaging().send(message);
    } else if (token) {
      const message: admin.messaging.TokenMessage = {
        token,
        notification: {title, body},
        data: {
          click_action: "FLUTTER_NOTIFICATION_CLICK",
          id: "worker_notification",
        },
        apns: {
          payload: {aps: {sound: "default"}},
        },
      };
      logger.info(`Sending FCM to token: ${token}`);
      response = await admin.messaging().send(message);
    } else {
      const msg = "Missing target: token or topic is required";
      res.status(400).json({error: msg});
      return;
    }

    res.status(200).json({success: true, messageId: response});
  } catch (error: unknown) {
    const err = error as Error;
    logger.error("Error sending FCM notification:", err.message);
    res.status(500).json({error: err.message || String(err)});
  }
});
