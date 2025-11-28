import React from 'react';
import { UploadedImage } from '../types';

interface ImagePreviewGridProps {
  images: UploadedImage[];
  onRemove: (index: number) => void;
  disabled: boolean;
}

export const ImagePreviewGrid: React.FC<ImagePreviewGridProps> = ({ images, onRemove, disabled }) => {
  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      {images.map((img, index) => (
        <div key={index} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
          <img 
            src={img.previewUrl} 
            alt={`Upload ${index + 1}`} 
            className="w-full h-full object-cover"
          />
          {!disabled && (
            <button
              onClick={() => onRemove(index)}
              className="absolute top-2 right-2 p-1.5 bg-red-500/90 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 focus:outline-none"
              title="Remove image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 18 18"/>
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
