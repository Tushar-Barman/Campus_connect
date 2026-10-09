import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Fields that are safe to send to ANY logged-in user. Use with .select() and .populate(). */
export const PUBLIC_USER_FIELDS = '_id name email bio profilePicture status lastSeen';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    bio: { type: String, default: '', trim: true, maxlength: 200 },
    profilePicture: { type: String, default: '' },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeen: { type: Date, default: Date.now },
    // Per-user favourites. Hidden by default; select('+starredConversations') when you need it.
    starredConversations: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Conversation' }],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.starredConversations;
        return ret;
      },
    },
  }
);

userSchema.index({ name: 1 });

/** Plain object with only public fields, for auth responses. */
export function toPublicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    profilePicture: user.profilePicture,
    status: user.status,
    lastSeen: user.lastSeen,
  };
}

export const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
