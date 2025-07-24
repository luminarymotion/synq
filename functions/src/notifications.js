const functions = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");

// AWS SNS credentials from environment config
const AWS_ACCESS_KEY_ID = functions.config().aws.access_key_id;
const AWS_SECRET_ACCESS_KEY = functions.config().aws.secret_access_key;
const AWS_REGION = functions.config().aws.region || 'us-east-1';

// Function to send SMS via AWS SNS
async function sendSMS(to, body) {
  return new Promise((resolve, reject) => {
    // Debug: Log the parameters received by sendSMS
    console.log("sendSMS function received:", {
      to: to,
      body: body,
      toType: typeof to,
      bodyType: typeof body,
      toLength: to ? to.length : 0,
      bodyLength: body ? body.length : 0
    });

    // Ensure phone number is properly formatted for AWS SNS
    let formattedTo = to;
    if (to && !to.startsWith('+')) {
      formattedTo = `+${to}`;
    }

    // AWS SNS API endpoint
    const snsEndpoint = `https://sns.${AWS_REGION}.amazonaws.com`;
    
    // Create the SNS publish request
    const snsParams = {
      Action: 'Publish',
      Version: '2010-03-31',
      Message: body,
      PhoneNumber: formattedTo,
      MessageAttributes: JSON.stringify({
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      })
    };

    // Convert params to URL-encoded string
    const postData = Object.keys(snsParams)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(snsParams[key])}`)
      .join('&');

    const options = {
      hostname: `sns.${AWS_REGION}.amazonaws.com`,
      port: 443,
      path: '/',
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        "Authorization": `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${new Date().toISOString().slice(0, 10)}/${AWS_REGION}/sns/aws4_request`,
      },
    };

    // Debug: Log the final post data
    console.log("AWS SNS post data:", postData);

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            resolve({MessageId: "unknown", status: "sent"});
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

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
      console.log("Invitee data:", JSON.stringify(inviteeData, null, 2));
      
      let phoneNumber = inviteeData.profile?.phoneNumber || inviteeData.phoneNumber;
      console.log("Raw phone number found:", phoneNumber);

      if (!phoneNumber) {
        console.log("No phone number found for user:", notification.userId);
        console.log("Profile structure:", {
          hasProfile: !!inviteeData.profile,
          profileKeys: inviteeData.profile ? Object.keys(inviteeData.profile) : [],
          hasPhoneNumber: !!inviteeData.phoneNumber,
          hasProfilePhoneNumber: !!inviteeData.profile?.phoneNumber
        });
        return null;
      }

      // Ensure phone number is in E.164 format (should already be formatted by frontend)
      if (!phoneNumber.startsWith('+')) {
        // Fallback formatting if frontend didn't format it
        const digitsOnly = phoneNumber.replace(/\D/g, '');
        if (digitsOnly.length === 10) {
          phoneNumber = `+1${digitsOnly}`;
        } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
          phoneNumber = `+${digitsOnly}`;
        } else {
          phoneNumber = `+1${digitsOnly}`;
        }
      }

      console.log("Final formatted phone number:", phoneNumber);

      // Get the ride details
      const rideDoc = await admin.firestore()
        .collection("rides")
        .doc(notification.metadata.rideId)
        .get();

      if (!rideDoc.exists) {
        console.error("Ride not found:", notification.metadata.rideId);
        return null;
      }

      const rideData = rideDoc.data();

      // Format the message with deep link
      const deepLink = `https://synq-v2-5a9e4.web.app/rides/${notification.metadata.rideId}`;
      const message = `You've been invited to join this ride by ${notification.metadata.inviterName}!\n\n` +
        `Destination: ${rideData.destination?.address || 'Unknown destination'}\n` +
        `Join here: ${deepLink}\n\n` +
        "Reply with:\n" +
        "ACCEPT to join the ride\n" +
        "DECLINE to decline\n" +
        "MAYBE if you're not sure yet";

      // Debug: Log the SMS parameters before sending
      console.log("About to send SMS with parameters:", {
        to: phoneNumber,
        body: message,
        phoneNumberType: typeof phoneNumber,
        phoneNumberLength: phoneNumber ? phoneNumber.length : 0,
        messageLength: message.length
      });

      // Send SMS via AWS SNS
      const smsResult = await sendSMS(phoneNumber, message);

      // Update the notification to mark SMS as sent
      await snap.ref.update({
        "metadata.smsSent": true,
        "metadata.smsSentAt": admin.firestore.FieldValue.serverTimestamp(),
        "metadata.smsSid": smsResult.MessageId || "unknown",
        "metadata.smsProvider": "aws-sns",
      });

      console.log("SMS sent successfully via AWS SNS:", {
        notificationId: context.params.notificationId,
        userId: notification.userId,
        phoneNumber,
        smsSid: smsResult.MessageId || "unknown",
      });

      return null;
    } catch (error) {
      console.error("Error sending SMS via AWS SNS:", error);

      // Update the notification with error information
      await snap.ref.update({
        "metadata.smsError": error.message,
        "metadata.smsErrorAt": admin.firestore.FieldValue.serverTimestamp(),
        "metadata.smsProvider": "aws-sns",
      });

      return null;
    }
  });
