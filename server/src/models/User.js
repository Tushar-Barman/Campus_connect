import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Fields that are safe to send to ANY logged-in user. Use with .select() and .populate(). */
export const PUBLIC_USER_FIELDS = '_id name email bio profilePicture status lastSeen campus';

// Round 2: personal preferences. Only the owner ever sees them (select:false + toJSON).
export const THEMES = ['light', 'dark', 'system'];
export const ACCENTS = ['teal', 'indigo', 'rose', 'amber', 'violet', 'slate'];
export const DENSITIES = ['comfortable', 'compact'];
export const FONT_SCALES = ['sm', 'md', 'lg'];
export const BUBBLE_STYLES = ['rounded', 'soft', 'sharp'];

const settingsSchema = new Schema(
  {
    readReceipts: { type: Boolean, default: true },
    theme: { type: String, enum: THEMES, default: 'system' },
    accent: { type: String, enum: ACCENTS, default: 'teal' },
    density: { type: String, enum: DENSITIES, default: 'comfortable' },
    fontScale: { type: String, enum: FONT_SCALES, default: 'md' },
    bubbleStyle: { type: String, enum: BUBBLE_STYLES, default: 'rounded' },
  },
  { _id: false }
);

export const DEFAULT_SETTINGS = Object.freeze({
  readReceipts: true,
  theme: 'system',
  accent: 'teal',
  density: 'comfortable',
  fontScale: 'md',
  bubbleStyle: 'rounded',
});

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    bio: { type: String, default: '', trim: true, maxlength: 200 },
    profilePicture: { type: String, default: '' },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeen: { type: Date, default: Date.now },
    // Campus id from config/campuses.js. Empty for accounts created before Round 2.
    campus: { type: String, default: '', maxlength: 40 },
    // Per-user favourites. Hidden by default; select('+starredConversations') when you need it.
    starredConversations: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Conversation' }],
      default: [],
      select: false,
    },
    // Round 2. All three are private to the owner and hidden by default.
    blockedUsers: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      select: false,
    },
    settings: { type: settingsSchema, default: () => ({}), select: false },
    // conversationId -> background value (preset id, #rrggbb or '')
    chatBackgrounds: { type: Map, of: String, default: () => new Map(), select: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.starredConversations;
        delete ret.blockedUsers;
        delete ret.settings;
        delete ret.chatBackgrounds;
        return ret;
      },
    },
  }
);

userSchema.index({ name: 1 });
userSchema.index({ campus: 1, name: 1 });
// "Who blocked me?" lookups.
userSchema.index({ blockedUsers: 1 });

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
    campus: user.campus ?? '',
  };
}

/** Settings with defaults filled in (older documents may lack some keys). */
export function settingsOf(user) {
  const stored = user?.settings?.toObject ? user.settings.toObject() : user?.settings;
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

/** Public fields + the owner's own settings. Only for responses that go to that same user. */
export function toOwnUser(user) {
  return { ...toPublicUser(user), settings: settingsOf(user) };
}

export const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
