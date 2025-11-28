import React, { useState, useMemo, useEffect } from 'react';
import { Detection, UploadedImage } from '../types';

interface DetectionResultProps {
  detections: Detection[];
  images: UploadedImage[];
}

export const DetectionResult: React.FC<DetectionResultProps> = ({ detections, images }) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Reset selection if images change (e.g. deletion)
  useEffect(() => {
    if (selectedIndex >= images.length) {
        setSelectedIndex(0);
    }
  }, [images.length, selectedIndex]);

  const detectionsByImage = useMemo(() => {
    const map = new Map<number, Detection[]>();
    // Initialize empty arrays for all images to ensure we have data for clean images too
    images.forEach((_, idx) => map.set(idx, []));

    detections.forEach(d => {
        // Handle cases where model might return index as string
        const idx = typeof d.imageIndex === 'string' ? parseInt(d.imageIndex as any) : d.imageIndex;
        if (idx >= 0 && idx < images.length) {
             if (!map.has(idx)) map.set(idx, []);
             map.get(idx)!.push(d);
        }
    });
    return map;
  }, [detections, images]);

  // Confidence color mapping: >0.85 (High), >0.6 (Medium), else (Low)
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return 'text-red-400 border-red-500/50 bg-red-500/10 shadow-[0_0_10px_rgba(248,113,113,0.3)]';
    if (confidence >= 0.6) return 'text-orange-400 border-orange-500/50 bg-orange-500/10';
    return 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10';
  };

  const getConfidenceBorder = (confidence: number) => {
    if (confidence >= 0.85) return 'border-red-500';
    if (confidence >= 0.6) return 'border-orange-500';
    return 'border-yellow-500';
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.85) return 'bg-red-500 text-white';
    if (confidence >= 0.6) return 'bg-orange-500 text-white';
    return 'bg-yellow-500 text-white';
  };

  const formatConfidence = (score: number) => {
      return `${Math.round(score * 100)}%`;
  };

  const getConfidenceLabel = (score: number) => {
      if (score >= 0.85) return "HIGH CONFIDENCE";
      if (score >= 0.6) return "MEDIUM CONFIDENCE";
      return "LOW CONFIDENCE";
  };

  const getBoxStyle = (box: [number, number, number, number]) => {
     let [ymin, xmin, ymax, xmax] = box;

     // Safety check: Ensure values are numbers
     ymin = Number(ymin);
     xmin = Number(xmin);
     ymax = Number(ymax);
     xmax = Number(xmax);

     // Heuristic: If all coordinates are very small (<= 1.5), assume they are normalized 0-1
     // Otherwise, assume they are 0-1000 scale
     if (ymin <= 1.5 && xmin <= 1.5 && ymax <= 1.5 && xmax <= 1.5) {
         // Normalized 0-1
         return {
           top: `${ymin * 100}%`,
           left: `${xmin * 100}%`,
           width: `${(xmax - xmin) * 100}%`,
           height: `${(ymax - ymin) * 100}%`,
         };
     }
     
     // 0-1000 scale
     return {
       top: `${ymin / 10}%`,
       left: `${xmin / 10}%`,
       width: `${(xmax - xmin) / 10}%`,
       height: `${(ymax - ymin) / 10}%`,
     };
  };

  if (!images || images.length === 0) return null;

  // CRITICAL FIX: Ensure index is valid for the current render cycle.
  // If an image was deleted, images.length decreases, but selectedIndex state update is async.
  // We clamp it immediately for this render pass.
  const safeIndex = selectedIndex >= images.length ? 0 : selectedIndex;

  const currentImage = images[safeIndex];
  // Guard against undefined currentImage if something goes really wrong
  if (!currentImage) return null;

  const currentDefects = detectionsByImage.get(safeIndex) || [];
  const hasDefects = currentDefects.length > 0;

  return (
    <div className="space-y-6">
      
      {/* Dense Navigation Strip */}
      <div className="bg-slate-900/50 border-y border-slate-800 backdrop-blur-sm -mx-8 px-8 py-4 overflow-x-auto">
        <div className="flex gap-3 min-w-min">
            {images.map((img, idx) => {
                const defectCount = detectionsByImage.get(idx)?.length || 0;
                const isSelected = safeIndex === idx;
                const isClean = defectCount === 0;

                return (
                    <button
                        key={idx}
                        onClick={() => setSelectedIndex(idx)}
                        className={`relative group flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all duration-200 
                            ${isSelected 
                                ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105 z-10' 
                                : 'border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600'
                            }
                        `}
                    >
                        <img src={img.previewUrl} className="w-full h-full object-cover" alt={`Thumb ${idx}`} />
                        
                        {/* Status Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center pb-1">
                            {isClean ? (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    <span>OK</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                                    <span>{defectCount}</span>
                                </div>
                            )}
                        </div>

                        {/* Selection Indicator */}
                        {isSelected && (
                            <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none"></div>
                        )}
                    </button>
                );
            })}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in duration-300" key={safeIndex}>
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-3">
              <span className="bg-slate-800 text-slate-400 text-xs px-2 py-1 rounded border border-slate-700">Image {safeIndex + 1}</span>
              {hasDefects ? (
                  <span className="text-red-400 flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      {currentDefects.length} Defects Found
                  </span>
              ) : (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      No Defects Detected
                  </span>
              )}
            </h3>
          </div>

          {/* Image Stage */}
          <div className="relative bg-slate-900/50 p-8 flex items-center justify-center overflow-hidden min-h-[400px]">
            <div className="relative inline-block shadow-2xl rounded-sm bg-black">
              <img 
                src={currentImage.previewUrl} 
                alt={`Analysis ${safeIndex + 1}`}
                className="max-h-[600px] max-w-full block object-contain" 
              />
              {currentDefects.map((det, dIdx) => {
                const uniqueId = `${safeIndex}-${dIdx}`;
                const isHovered = hoveredId === uniqueId;
                const borderColor = getConfidenceBorder(det.confidence);
                const badgeColor = getConfidenceBadge(det.confidence);
                
                return (
                  <div 
                    key={dIdx}
                    className={`absolute border-2 transition-all duration-200 ease-out group cursor-pointer
                      ${isHovered 
                        ? 'z-30 shadow-[0_0_15px_rgba(255,255,255,0.3)] border-white' 
                        : `${borderColor} z-10 opacity-80 hover:opacity-100`
                      }
                    `}
                    style={getBoxStyle(det.box_2d)}
                    onMouseEnter={() => setHoveredId(uniqueId)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                     {/* Label Tag on Box */}
                     <div className={`absolute -top-7 left-0 whitespace-nowrap px-2 py-1 text-[10px] font-bold rounded transition-all shadow-sm flex items-center gap-1
                        ${isHovered ? 'bg-white text-slate-900 scale-110 origin-bottom-left z-50' : badgeColor}
                     `}>
                        <span>{det.label}</span>
                        <span className="w-1 h-3 border-l border-white/30 mx-0.5"></span>
                        <span className="uppercase tracking-tighter opacity-90">{formatConfidence(det.confidence)}</span>
                     </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detections List Grid or Empty State */}
          <div className="p-6 bg-slate-950/50 border-t border-slate-800">
            {hasDefects ? (
                <>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Inspection Report</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {currentDefects.map((det, dIdx) => {
                        const uniqueId = `${safeIndex}-${dIdx}`;
                        const isHovered = hoveredId === uniqueId;
                        const cardStyle = getConfidenceColor(det.confidence);

                        return (
                        <div 
                            key={dIdx}
                            onMouseEnter={() => setHoveredId(uniqueId)}
                            onMouseLeave={() => setHoveredId(null)}
                            className={`p-4 rounded-xl border transition-all duration-200 cursor-default
                                ${isHovered 
                                ? 'bg-slate-800 border-white/50 shadow-lg scale-[1.02]' 
                                : `${cardStyle} border-opacity-30 bg-opacity-5`
                                }
                            `}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-sm font-bold ${isHovered ? 'text-white' : 'text-slate-200'}`}>
                                {det.label}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border
                                    ${det.confidence >= 0.85 ? 'bg-red-500/20 text-red-400 border-red-500/30' : 
                                    det.confidence >= 0.6 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 
                                    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}
                                `}>
                                {formatConfidence(det.confidence)}
                                </span>
                            </div>
                            <div className="mb-2">
                                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-500 ${det.confidence >= 0.85 ? 'bg-red-500' : det.confidence >= 0.6 ? 'bg-orange-500' : 'bg-yellow-500'}`}
                                        style={{ width: `${det.confidence * 100}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-[9px] text-slate-500 uppercase font-medium">{getConfidenceLabel(det.confidence)}</span>
                                </div>
                            </div>
                            <p className={`text-sm leading-relaxed ${isHovered ? 'text-slate-200' : 'text-slate-400'}`}>
                                {det.description}
                            </p>
                            <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                                <span>Defect #{dIdx + 1}</span>
                            </div>
                        </div>
                        );
                    })}
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                         <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <h4 className="text-lg font-bold text-slate-300 mb-1">Passed Inspection</h4>
                    <p className="text-sm text-slate-500 max-w-xs">No defects matching the criteria were found in this image.</p>
                </div>
            )}
          </div>

      </div>
    </div>
  );
};