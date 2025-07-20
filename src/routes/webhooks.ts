import express from "express";

const router = express.Router();

import WebhookController from "../controllers/webhookController";
import webhookAuth from "../middleware/webhookAuth";

// WordPress plugin webhook
router.post(
  "/wordpress",
  webhookAuth,
  WebhookController.handleWordPressBooking
);

// WhatsApp webhook
router.post("/whatsapp", webhookAuth, WebhookController.handleWhatsAppMessage);

// Third-party platform webhooks
router.post("/practo", webhookAuth, WebhookController.handlePractoBooking);
router.post(
  "/google-calendar",
  webhookAuth,
  WebhookController.handleGoogleCalendar
);

// SMS webhook
router.post("/sms", webhookAuth, WebhookController.handleSMSBooking);

// Email webhook
router.post("/email", webhookAuth, WebhookController.handleEmailBooking);

// Generic API webhook
router.post(
  "/external/:source",
  webhookAuth,
  WebhookController.handleExternalBooking
);

// module.exports = router;
export default router;
