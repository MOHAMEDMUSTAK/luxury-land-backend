require('dotenv').config();
const mongoose = require('mongoose');
const webpush = require('web-push');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mohamedmustak9355_db_user:massma123@ac-vwdtpwy-shard-00-00.rtwj0sa.mongodb.net:27017,ac-vwdtpwy-shard-00-01.rtwj0sa.mongodb.net:27017,ac-vwdtpwy-shard-00-02.rtwj0sa.mongodb.net:27017/landDB?ssl=true&replicaSet=atlas-rjded5-shard-0&authSource=admin&retryWrites=true&w=majority';

async function diagnosePush() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to DB');

    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      console.error('❌ VAPID keys missing from .env');
      process.exit(1);
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@luxuryland.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    // Find users with push subscriptions
    const users = await User.find({ 'pushSubscriptions.0': { $exists: true } });
    console.log(`Found ${users.length} users with push subscriptions.`);

    if (users.length === 0) {
      console.log('❌ No users are currently subscribed to push notifications in the database.');
      console.log('This means the frontend is failing to send the subscription to the backend, OR the user hasn\'t allowed permissions.');
      process.exit(0);
    }

    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      console.log(`\nTesting pushes for user: ${user.name} (${user.email}) - Has ${user.pushSubscriptions.length} subscriptions`);
      
      const payload = JSON.stringify({
        title: 'Diagnostic Test',
        body: 'If you see this, push notifications are working!',
        type: 'system',
        priority: 'high',
        tag: `test_${Date.now()}`,
        url: '/'
      });

      for (const sub of user.pushSubscriptions) {
        try {
          console.log(`Sending to endpoint: ${sub.endpoint.substring(0, 50)}...`);
          await webpush.sendNotification(sub, payload);
          console.log(`✅ Push sent successfully to endpoint.`);
          successCount++;
        } catch (err) {
          console.error(`❌ Push failed for endpoint.`);
          console.error(`Status code: ${err.statusCode}`);
          console.error(`Error body:`, err.body);
          failureCount++;
        }
      }
    }

    console.log(`\nDiagnostic complete. Success: ${successCount}, Failures: ${failureCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Fatal error during diagnostic:', error);
    process.exit(1);
  }
}

diagnosePush();
