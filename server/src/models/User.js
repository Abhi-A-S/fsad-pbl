import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Never return passwordHash in queries by default
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [50, 'Display name cannot exceed 50 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

/**
 * Hashes a plaintext password using bcrypt.
 * @param {string} password
 * @returns {Promise<string>}
 */
userSchema.statics.hashPassword = async function (password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

/**
 * Compares candidate password against stored password hash.
 * @param {string} candidatePassword
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
userSchema.statics.comparePassword = async function (candidatePassword, hash) {
  if (!candidatePassword || !hash) return false;
  return bcrypt.compare(candidatePassword, hash);
};

/**
 * Strips sensitive fields when serializing to JSON.
 */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export const User = mongoose.model('User', userSchema);

