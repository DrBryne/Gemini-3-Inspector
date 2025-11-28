export interface UploadedImage {
  file: File;
  previewUrl: string;
  base64Data: string;
  mimeType: string;
}

export enum SendingStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface GenerationResponse {
  text: string;
  thinkingUsed?: boolean;
}

export interface Detection {
  label: "DEFORMATION & DENTS" | "MISSING OR LOOSE BOLTS" | "HOLES";
  confidence: number;
  description: string;
  imageIndex: number;
  box_2d: [number, number, number, number]; // ymin, xmin, ymax, xmax
}

export type ThinkingLevel = "LOW" | "HIGH";

export interface GenerationConfig {
  thinkingLevel: ThinkingLevel;
  temperature: number;
  topP: number;
}