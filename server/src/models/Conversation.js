import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Same key for (A, B) and (B, A): the two ids sorted and joined with "_". */
export function makePrivateKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join('_');
}

const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['private', 'group'], required: true },
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2,
        message: 'A conversation needs at least 2 participants',
      },
    },
    // Only set for private chats. Never give it a default: the unique index
    // below ignores documents where it is missing (groups).
    privateKey: { type: String },
    groupName: { type: String, trim: true, maxlength: 50 },
    groupAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
    groupPicture: { type: String, default: '' },
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

conversationSchema.pre('validate', function setPrivateKey(next) {
  if (this.type === 'private') {
    if (this.participants.length !== 2) {
      this.invalidate('participants', 'A private chat must have exactly 2 participants');
    } else {
      this.privateKey = makePrivateKey(this.participants[0], this.participants[1]);
    }
  } else {
    this.privateKey = undefined;
  }
  next();
});

// Prevents duplicate private chats, even if two requests race.
conversationSchema.index(
  { privateKey: 1 },
  { unique: true, partialFilterExpression: { privateKey: { $type: 'string' } } }
);
// "My chats, newest first".
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export const Conversation =
  mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

export default Conversation;
