import mongoose from 'mongoose';

const { Schema } = mongoose;

export const MESSAGE_TYPES = ['text', 'voice', 'image', 'file'];
export const MAX_TEXT_LENGTH = 4000;

// One entry per recipient. Arrays work for private chats and groups alike.
const receiptSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    messageType: { type: String, enum: MESSAGE_TYPES, default: 'text' },
    text: { type: String, trim: true, maxlength: MAX_TEXT_LENGTH, default: '' },
    mediaUrl: { type: String, default: '' },
    mediaType: { type: String, default: '' },
    duration: { type: Number, min: 0 },
    deliveredTo: { type: [receiptSchema], default: [] },
    readBy: { type: [receiptSchema], default: [] },
    isPinned: { type: Boolean, default: false },
    pinnedAt: { type: Date },
    pinnedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

messageSchema.pre('validate', function checkContent(next) {
  if (this.messageType === 'text' && !this.text) {
    this.invalidate('text', 'Message text is required');
  }
  if (this.messageType !== 'text' && !this.mediaUrl) {
    this.invalidate('mediaUrl', 'Media messages need a mediaUrl');
  }
  next();
});

// Message history + pagination ("messages in this chat before X, newest first").
messageSchema.index({ conversationId: 1, createdAt: -1 });
// Pinned list per chat.
messageSchema.index({ conversationId: 1, isPinned: 1 });

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default Message;
