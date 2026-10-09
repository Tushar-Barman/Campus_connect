import mongoose from 'mongoose';

const { Schema } = mongoose;

export const MESSAGE_TYPES = ['text', 'voice', 'image', 'file', 'location', 'location_request'];
export const MAX_TEXT_LENGTH = 4000;
export const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'expired'];

// Types whose content isn't a stored file.
const NO_MEDIA_TYPES = ['text', 'location', 'location_request'];

// One entry per recipient. Arrays work for private chats and groups alike.
const receiptSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const locationSchema = new Schema(
  {
    lat: { type: Number, min: -90, max: 90, required: true },
    lng: { type: Number, min: -180, max: 180, required: true },
    accuracy: { type: Number, min: 0, max: 5000 },
    label: { type: String, trim: true, maxlength: 60, default: '' },
    onCampus: { type: Boolean, default: false },
    campus: { type: String, default: '' },
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

    // Round 2: documents
    fileName: { type: String, maxlength: 120 },
    fileSize: { type: Number, min: 0 },
    mimeType: { type: String, maxlength: 100 },
    // Round 2: location sharing
    location: { type: locationSchema, default: undefined },
    requestStatus: { type: String, enum: REQUEST_STATUSES },
    respondedWith: { type: Schema.Types.ObjectId, ref: 'Message' },
    // Round 2: replies, mentions, edit, delete
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message' },
    mentions: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: undefined },
    editedAt: { type: Date },
    deletedAt: { type: Date }, // deleted for everyone
    hiddenFor: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: undefined }, // deleted for me
  },
  { timestamps: true, toJSON: { versionKey: false } }
);

messageSchema.pre('validate', function checkContent(next) {
  // A message deleted for everyone keeps only its metadata.
  if (this.deletedAt) return next();
  if (this.messageType === 'text' && !this.text) {
    this.invalidate('text', 'Message text is required');
  }
  if (!NO_MEDIA_TYPES.includes(this.messageType) && !this.mediaUrl) {
    this.invalidate('mediaUrl', 'Media messages need a mediaUrl');
  }
  if (this.messageType === 'location' && !this.location) {
    this.invalidate('location', 'Location messages need a location');
  }
  next();
});

// Message history + pagination ("messages in this chat before X, newest first").
messageSchema.index({ conversationId: 1, createdAt: -1 });
// Pinned list per chat.
messageSchema.index({ conversationId: 1, isPinned: 1 });

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default Message;
