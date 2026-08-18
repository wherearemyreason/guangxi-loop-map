export type MomentMediaKind = 'image' | 'video';

export interface MomentMedia {
  id: string;
  kind: MomentMediaKind;
  url: string;
  alt: string;
}

export interface MomentComment {
  id: string;
  author: string;
  replyTo?: string;
  body: string;
}

export interface Moment {
  id: string;
  author: string;
  avatar: string;
  body: string;
  publishedAt: string;
  location?: string;
  media: MomentMedia[];
  feedbackScreenshot?: MomentMedia;
  likes: string[];
  comments: MomentComment[];
  sourceScreenshotName?: string;
  createdBy: 'owner' | 'contributor';
}

export interface MomentDraft {
  body: string;
  publishedAt: string;
  location: string;
  author: string;
  media: MomentMedia[];
  feedbackScreenshot?: MomentMedia;
  likes: string[];
  comments: MomentComment[];
  sourceScreenshotName?: string;
}
