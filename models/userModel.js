class UserModel {
  constructor(data = {}) {
    this.userName = data.userName || null;
    this.userId = data.userId || null;
    this.userImage = data.userImage || null; // Map<String, String> for Cloudinary URLs
    this.userEmail = data.userEmail || null;
    this.userPhone = data.userPhone || null;
    this.userAddress = data.userAddress || null;
    this.gender = data.gender || null;
    this.dob = data.dob || null;
    this.plan = data.plan || 'basic'; // basic, premium, pro
    this.status = data.status || 'unverified'; // verified, unverified, suspended
    this.otp = data.otp || null;
    this.fcmToken = data.fcmToken || null;
    this.role = data.role || 'user'; // user, admin, expert
    this.isOnline = data.isOnline || 'false';
    this.lastActive = data.lastActive || null;
    this.about = data.about || '';
    this.credits = data.credits || 0;
    this.lastCreditReset = data.lastCreditReset || null;
    this.selectedPaymentMethods = data.selectedPaymentMethods || [];
    this.paymentHistory = data.paymentHistory || [];
    this.notification = data.notification || [];
    this.bookmarks = data.bookmarks || [];
    this.myPlants = data.myPlants || [];
    this.diagnosisHistory = data.diagnosisHistory || [];
    this.postArticle = data.postArticle || [];
    
    // Subscription management fields
    this.subscriptionStatus = data.subscriptionStatus || 'inactive'; // active, inactive, expired, cancelled
    this.subscriptionStartDate = data.subscriptionStartDate || null;
    this.subscriptionEndDate = data.subscriptionEndDate || null;
    this.subscriptionType = data.subscriptionType || null; // monthly, yearly
    this.autoRenewal = data.autoRenewal || false;
    
    // Timestamps
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Convert to JSON for Firestore
  toFirestore() {
    const data = { ...this };
    // Convert dates to Firestore timestamps if needed
    if (this.lastCreditReset && typeof this.lastCreditReset === 'string') {
      data.lastCreditReset = new Date(this.lastCreditReset);
    }
    if (this.subscriptionStartDate && typeof this.subscriptionStartDate === 'string') {
      data.subscriptionStartDate = new Date(this.subscriptionStartDate);
    }
    if (this.subscriptionEndDate && typeof this.subscriptionEndDate === 'string') {
      data.subscriptionEndDate = new Date(this.subscriptionEndDate);
    }
    data.updatedAt = new Date().toISOString();
    return data;
  }

  // Create from Firestore document
  static fromFirestore(doc) {
    const data = doc.data();
    return new UserModel({
      ...data,
      userId: doc.id,
      // Convert Firestore timestamps back to ISO strings if needed
      lastCreditReset: data.lastCreditReset?.toDate?.()?.toISOString() || data.lastCreditReset,
      subscriptionStartDate: data.subscriptionStartDate?.toDate?.()?.toISOString() || data.subscriptionStartDate,
      subscriptionEndDate: data.subscriptionEndDate?.toDate?.()?.toISOString() || data.subscriptionEndDate,
    });
  }

  // Validation method
  validate() {
    const errors = [];
    
    if (!this.userName || this.userName.trim().length < 2) {
      errors.push('User name must be at least 2 characters long');
    }
    
    if (!this.userEmail || !this.isValidEmail(this.userEmail)) {
      errors.push('Valid email is required');
    }
    
    if (!this.userPhone || this.userPhone.trim().length < 10) {
      errors.push('Valid phone number is required');
    }
    
    if (!['user', 'admin', 'expert'].includes(this.role)) {
      errors.push('Invalid role specified');
    }
    
    if (!['basic', 'Pro'].includes(this.plan)) {
      errors.push('Invalid plan specified');
    }
    
    if (!['verified', 'unverified', 'suspended'].includes(this.status)) {
      errors.push('Invalid status specified');
    }

    return errors;
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Subscription management methods
  activateSubscription(type, duration) {
    this.subscriptionStatus = 'active';
    this.subscriptionType = type;
    this.subscriptionStartDate = new Date().toISOString();
    
    const endDate = new Date();
    if (duration === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (duration === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    
    this.subscriptionEndDate = endDate.toISOString();
    this.updatedAt = new Date().toISOString();
  }

  cancelSubscription() {
    this.subscriptionStatus = 'cancelled';
    this.autoRenewal = false;
    this.updatedAt = new Date().toISOString();
  }

  isSubscriptionActive() {
    if (this.subscriptionStatus !== 'active') return false;
    if (!this.subscriptionEndDate) return false;
    
    const endDate = new Date(this.subscriptionEndDate);
    return new Date() < endDate;
  }
}

module.exports = UserModel;
