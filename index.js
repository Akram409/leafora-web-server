const express = require("express") ;
const cors = require("cors");
require("dotenv").config();
const admin = require("firebase-admin");
const UserModel = require("./models/userModel");
const serviceAccount = require("./lefora-ai-firebase-adminsdk-2vpg3-7e25033328.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "https://leafora-web-client.vercel.app"],
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

// Middleware to verify admin token
const verifyAdminToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    if (userData.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = { uid: decodedToken.uid, ...userData };
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Authentication Routes
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password, idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Check if user exists and is admin
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    if (userData.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Update last active
    await db.collection('users').doc(uid).update({
      lastActive: new Date().toISOString(),
      isOnline: 'true'
    });

    res.status(200).json({
      message: 'Admin login successful',
      user: UserModel.fromFirestore({ id: uid, data: () => userData })
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post("/admin/logout", verifyAdminToken, async (req, res) => {
  try {
    await db.collection('users').doc(req.user.uid).update({
      isOnline: 'false',
      lastActive: new Date().toISOString()
    });

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// User Management Routes
app.get("/admin/users", verifyAdminToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '', status = '', plan = '' } = req.query;
    
    let query = db.collection("users");
    
    // Apply filters
    if (role) {
      query = query.where('role', '==', role);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    if (plan) {
      query = query.where('plan', '==', plan);
    }

    const snapshot = await query.get();
    let users = snapshot.docs.map(doc => UserModel.fromFirestore(doc));

    // Apply search filter (client-side for now)
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(user => 
        user.userName?.toLowerCase().includes(searchLower) ||
        user.userEmail?.toLowerCase().includes(searchLower) ||
        user.userPhone?.includes(search)
      );
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = users.slice(startIndex, endIndex);

    res.status(200).json({
      users: paginatedUsers,
      totalUsers: users.length,
      currentPage: parseInt(page),
      totalPages: Math.ceil(users.length / limit)
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/admin/users/:userId", verifyAdminToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = UserModel.fromFirestore(userDoc);
    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post("/admin/users", verifyAdminToken, async (req, res) => {
  try {
    const userData = req.body;
    const userModel = new UserModel(userData);
    
    // Validate user data
    const validationErrors = userModel.validate();
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    // Create Firebase Auth user
    const authUser = await auth.createUser({
      email: userModel.userEmail,
      password: userData.password || 'TempPassword123!',
      displayName: userModel.userName,
    });

    // Set userId from Firebase Auth
    userModel.userId = authUser.uid;

    // Save to Firestore
    await db.collection('users').doc(authUser.uid).set(userModel.toFirestore());

    res.status(201).json({
      message: 'User created successfully',
      user: userModel
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put("/admin/users/:userId", verifyAdminToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Get existing user
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingUser = UserModel.fromFirestore(userDoc);
    const updatedUser = new UserModel({ ...existingUser, ...updateData });
    
    // Validate updated data
    const validationErrors = updatedUser.validate();
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    // Update Firestore
    await db.collection('users').doc(userId).update(updatedUser.toFirestore());

    // Update Firebase Auth if email changed
    if (updateData.userEmail && updateData.userEmail !== existingUser.userEmail) {
      await auth.updateUser(userId, {
        email: updateData.userEmail,
        displayName: updateData.userName || existingUser.userName
      });
    }

    res.status(200).json({
      message: 'User updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete("/admin/users/:userId", verifyAdminToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete from Firebase Auth
    await auth.deleteUser(userId);

    // Delete from Firestore
    await db.collection('users').doc(userId).delete();

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Subscription Management Routes
app.put("/admin/users/:userId/subscription", verifyAdminToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, type, duration, autoRenewal } = req.body;

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = UserModel.fromFirestore(userDoc);

    switch (action) {
      case 'activate':
        user.activateSubscription(type, duration);
        user.autoRenewal = autoRenewal || false;
        break;
      case 'cancel':
        user.cancelSubscription();
        break;
      case 'extend':
        if (user.subscriptionEndDate) {
          const currentEnd = new Date(user.subscriptionEndDate);
          if (duration === 'monthly') {
            currentEnd.setMonth(currentEnd.getMonth() + 1);
          } else if (duration === 'yearly') {
            currentEnd.setFullYear(currentEnd.getFullYear() + 1);
          }
          user.subscriptionEndDate = currentEnd.toISOString();
        }
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    await db.collection('users').doc(userId).update(user.toFirestore());

    res.status(200).json({
      message: 'Subscription updated successfully',
      user: user
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Analytics Routes
app.get("/admin/analytics", verifyAdminToken, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => UserModel.fromFirestore(doc));

    const analytics = {
      totalUsers: users.length,
      usersByRole: {
        user: users.filter(u => u.role === 'user').length,
        admin: users.filter(u => u.role === 'admin').length,
        expert: users.filter(u => u.role === 'expert').length,
      },
      usersByStatus: {
        verified: users.filter(u => u.status === 'verified').length,
        unverified: users.filter(u => u.status === 'unverified').length,
        suspended: users.filter(u => u.status === 'suspended').length,
      },
      usersByPlan: {
        basic: users.filter(u => u.plan === 'basic').length,
        premium: users.filter(u => u.plan === 'premium').length,
        pro: users.filter(u => u.plan === 'pro').length,
      },
      subscriptionStats: {
        active: users.filter(u => u.subscriptionStatus === 'active').length,
        inactive: users.filter(u => u.subscriptionStatus === 'inactive').length,
        expired: users.filter(u => u.subscriptionStatus === 'expired').length,
        cancelled: users.filter(u => u.subscriptionStatus === 'cancelled').length,
      },
      recentUsers: users
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
    };

    res.status(200).json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Middleware to verify user token (for regular users)
const verifyUserToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decodedToken = await auth.verifyIdToken(token);
    req.user = { uid: decodedToken.uid };
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// User Profile Routes (for regular users)
app.get("/users/profile", verifyUserToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = UserModel.fromFirestore(userDoc);
    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

app.put("/users/profile", verifyUserToken, async (req, res) => {
  try {
    const updateData = req.body;
    const userId = req.user.uid;

    // Get existing user
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingUser = UserModel.fromFirestore(userDoc);
    
    // Only allow users to update certain fields
    const allowedFields = ['userName', 'userPhone', 'userAddress', 'gender', 'dob', 'about', 'userImage'];
    const filteredUpdateData = {};
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field];
      }
    });

    const updatedUser = new UserModel({ ...existingUser, ...filteredUpdateData });
    
    // Update Firestore
    await db.collection('users').doc(userId).update(updatedUser.toFirestore());

    res.status(200).json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// API: Root Endpoint
app.get("/", (req, res) => {
  res.send("Leafora Admin Server is running");
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
