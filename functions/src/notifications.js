const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: functions.config().gmail.email,
    pass: functions.config().gmail.password,
  },
});

// Function to send SMS via email gateway
exports.sendSmsNotification = functions.firestore
  .document("notifications/{notificationId}")
  .onCreate(async (snap, context) => {
    const notification = snap.data();

    // Only process ride invitations
    if (notification.type !== "ride-invitation") {
      return null;
    }

    try {
      // Get the invitee's user profile
      const inviteeDoc = await admin.firestore()
        .collection("users")
        .doc(notification.userId)
        .get();

      if (!inviteeDoc.exists) {
        console.error("Invitee profile not found:", notification.userId);
        return null;
      }

      const inviteeData = inviteeDoc.data();
      const phoneNumber = inviteeData.phoneNumber;

      if (!phoneNumber) {
        console.log("No phone number found for user:", notification.userId);
        return null;
      }

      // Get the ride details
      const rideDoc = await admin.firestore()
        .collection("rides")
        .doc(notification.rideId)
        .get();

      if (!rideDoc.exists) {
        console.error("Ride not found:", notification.rideId);
        return null;
      }

      const rideData = rideDoc.data();

      // Format the message
      const message = `SynqRoute: ${notification.message}\n\n` +
        `From: ${notification.metadata.inviterName}\n` +
        `To: ${rideData.destination}\n` +
        "Reply with:\n" +
        "ACCEPT to join the ride\n" +
        "DECLINE to decline\n" +
        "MAYBE if you're not sure yet";

      // Get the SMS gateway for the phone number
      const areaCode = phoneNumber.substring(2, 5); // Get area code from +1XXXXXXXXXX format
      let carrier = "verizon"; // Default to Verizon

      // Simple carrier detection based on area code ranges
      const carrierRanges = {
        "verizon": [
          {start: 201, end: 989}, // Most US area codes
          {exclude: [ // Exclude specific ranges that belong to other carriers
            {start: 205, end: 989}, // AT&T range
          ],
          },
        ],
        "att": [
          {start: 205, end: 989}, // AT&T's primary range
        ],
        "tmobile": [
          {start: 201, end: 989}, // Most US area codes
          {exclude: [ // Exclude specific ranges that belong to other carriers
            {start: 205, end: 989}, // AT&T range
          ],
          },
        ],
      };

      // Function to check if an area code falls within a range
      const isInRange = (areaCode, ranges) => {
        const areaCodeNum = parseInt(areaCode, 10);
        return ranges.some((range) => {
          if (range.exclude) {
            // Check if the area code is in the main range but not in excluded ranges
            const inMainRange = areaCodeNum >= range.start && areaCodeNum <= range.end;
            const inExcludedRange = range.exclude.some((excludeRange) =>
              areaCodeNum >= excludeRange.start && areaCodeNum <= excludeRange.end,
            );
            return inMainRange && !inExcludedRange;
          }
          return areaCodeNum >= range.start && areaCodeNum <= range.end;
        });
      };

      // Check each carrier's ranges
      for (const [carrierName, ranges] of Object.entries(carrierRanges)) {
        if (isInRange(areaCode, ranges)) {
          carrier = carrierName;
          break;
        }
      }

      // Get the appropriate gateway
      const gateways = {
        "verizon": "@vtext.com",
        "att": "@txt.att.net",
        "tmobile": "@tmomail.net",
      };

      const gateway = gateways[carrier];
      if (!gateway) {
        console.error("No gateway found for carrier:", carrier);
        return null;
      }

      // Format the phone number for the gateway
      const nationalNumber = phoneNumber.substring(2); // Remove '+1'
      const smsGateway = `${nationalNumber}${gateway}`;

      // Send the email
      await transporter.sendMail({
        from: "noreply@synqroute.com",
        to: smsGateway,
        subject: "", // SMS messages don't need subjects
        text: message,
      });

      // Update the notification to mark SMS as sent
      await snap.ref.update({
        "metadata.smsSent": true,
        "metadata.smsSentAt": admin.firestore.FieldValue.serverTimestamp(),
        "metadata.smsGateway": smsGateway,
      });

      console.log("SMS sent successfully:", {
        notificationId: context.params.notificationId,
        userId: notification.userId,
        gateway: smsGateway,
      });

      return null;
    } catch (error) {
      console.error("Error sending SMS:", error);

      // Update the notification with error information
      await snap.ref.update({
        "metadata.smsError": error.message,
        "metadata.smsErrorAt": admin.firestore.FieldValue.serverTimestamp(),
      });

      return null;
    }
  });
 