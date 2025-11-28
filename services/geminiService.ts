import { GoogleGenAI, Type } from "@google/genai";
import { UploadedImage, GenerationConfig } from "../types";

export const detectionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      label: {
        type: Type.STRING,
        enum: ["DEFORMATION & DENTS", "MISSING OR LOOSE BOLTS", "HOLES"]
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0.0 (low certainty) and 1.0 (high certainty) that the defect exists."
      },
      description: { type: Type.STRING },
      imageIndex: { type: Type.INTEGER },
      box_2d: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
        description: "Bounding box coordinates in [ymin, xmin, ymax, xmax] format on a 1000x1000 scale."
      }
    },
    required: ["label", "confidence", "description", "imageIndex", "box_2d"]
  }
};

export const generateContentWithGemini = async (
  prompt: string, 
  images: UploadedImage[],
  config: GenerationConfig
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Construct parts: Text prompt + Images
    const parts: any[] = [];
    
    // Add images
    images.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64Data
        }
      });
    });

    // Add text prompt
    parts.push({
      text: prompt
    });

    // Map thinkingLevel to thinkingBudget
    // Gemini 3 Pro Preview supports high thinking budget (up to 32k)
    // Low: 2k tokens, High: 16k tokens
    const budget = config.thinkingLevel === 'HIGH' ? 16000 : 2000;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: parts
      },
      config: {
        temperature: config.temperature,
        topP: config.topP,
        thinkingConfig: { 
          thinkingBudget: budget 
        },
        responseMimeType: "application/json",
        responseSchema: detectionSchema
      }
    });

    // Extract text using the property accessor, not a method call
    return response.text || "[]";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to generate content");
  }
};