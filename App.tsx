import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UploadedImage, SendingStatus, Detection, ThinkingLevel } from './types';
import { processFile } from './utils/fileUtils';
import { generateContentWithGemini, detectionSchema } from './services/geminiService';
import { ImagePreviewGrid } from './components/ImagePreviewGrid';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { DetectionResult } from './components/DetectionResult';

const DEFAULT_ROLE = `You are an Expert Highway Infrastructure Inspection AI. Your task is to analyze a set of input images depicting W-beam guardrail systems. 

Your goal is to identify and localize defects that compromise structural integrity or safety. Operate with high sensitivity; flag any suspected anomalies even if image resolution prevents absolute confirmation.`;

const DEFAULT_CRITERIA = `Scan the images for the following specific issues:

1. DEFORMATION & DENTS
   - Scan upper and lower silhouette edges for interruptions, jaggedness, or sudden vertical deviations.
   - Analyze light reflections: Look for "zig-zags" or sudden breaks in the linear reflection patterns on the rail surface.
   
2. MISSING OR LOOSE BOLTS
   - Inspect the overlap of rail segments.
   - Flag visible holes missing bolt heads.
   - Flag bolt heads protruding significantly further than neighbors or casting irregular/drooping shadows.

3. HOLES
   - Flag irregular, jagged, or rust-rimmed holes that indicate tears or rust-through.`;

const DEFAULT_ATTRIBUTES = `When reporting a defect, populate the fields as follows:
- **Severity:** 
  - "High": Critical safety hazard (e.g., missing bolts, large tears, sharp jagged edges).
  - "Medium": Noticeable structural issue (e.g., deep dents, rust-through).
  - "Low": Minor or cosmetic anomaly (e.g., shallow surface deviations).
- **Description:** A concise explanation of the visual cue observed (e.g., "Top edge silhouette appears jagged," or "Shadow indicates protruding bolt.").`;

const DEFAULT_FORMAT = `You must return the results as a single, valid JSON array. Follow these rules strictly:

1. **Batch Processing:** Use the \`imageIndex\` (0-based) to indicate which image in the set the detection belongs to.
2. **Coordinates:** \`box_2d\` must be [ymin, xmin, ymax, xmax] using normalized coordinates (0 to 1).
3. **Format:** Output **ONLY** raw JSON. Do not include Markdown formatting (no \`\`\`json ... \`\`\` blocks), no explanatory text, and no chatter.`;

const STORAGE_KEYS = {
  ROLE: "gemini_analyzer_role",
  CRITERIA: "gemini_analyzer_criteria",
  ATTRIBUTES: "gemini_analyzer_attributes",
  FORMAT: "gemini_analyzer_format"
};

const MAX_HISTORY = 10;

// Hook for persistent string state
const usePersistentString = (key: string, defaultValue: string) => {
    const [value, setValue] = useState(() => {
         try {
             return localStorage.getItem(key) ?? defaultValue;
         } catch (e) {
             console.warn(`Failed to load ${key}`, e);
             return defaultValue;
         }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn(`Failed to save ${key}`, e);
        }
    }, [key, value]);

    return [value, setValue] as const;
};

// Hook for history management
const useHistory = (key: string, currentValue: string) => {
    const [history, setHistory] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(`${key}_history`);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    // Sync history to localStorage whenever it changes
    useEffect(() => {
        try {
             localStorage.setItem(`${key}_history`, JSON.stringify(history));
        } catch (e) {
             console.error("Failed to save history", e);
        }
    }, [history, key]);

    // Commit current value to history
    const commit = useCallback(() => {
        if (!currentValue.trim()) return;
        
        setHistory(prev => {
             // Avoid duplicates at the top of the stack
             if (prev.length > 0 && prev[0] === currentValue) return prev;
             return [currentValue, ...prev].slice(0, MAX_HISTORY);
        });
    }, [currentValue]);

    return { history, commit };
};

interface PromptSectionProps {
    id: string;
    label: string;
    value: string;
    setValue: (v: string) => void;
    isExpanded: boolean;
    toggleSection: (id: string) => void;
    isLoading: boolean;
    onKeyDown: (e: React.KeyboardEvent) => void;
    history: string[];
    heightClass?: string;
    placeholder?: string;
}

// Extracted component to prevent re-renders losing focus
const PromptSection: React.FC<PromptSectionProps> = ({ 
    id,
    label, 
    value, 
    setValue, 
    isExpanded,
    toggleSection,
    isLoading,
    onKeyDown,
    history,
    heightClass = "h-48",
    placeholder
  }) => {
    const [showHistory, setShowHistory] = useState(false);

    return (
        <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-visible transition-all duration-200 mb-3 hover:border-slate-700 relative z-0">
             <div className="flex items-center justify-between w-full p-4 border-b border-transparent hover:bg-slate-800/50 transition-colors group select-none relative rounded-t-xl">
                <button 
                    onClick={() => toggleSection(id)}
                    className="flex-1 flex items-center gap-3 text-left focus:outline-none"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-400' : ''}`}><path d="m9 18 6-6-6-6"/></svg>
                    <span className={`text-xs font-bold uppercase tracking-wider transition-colors ${isExpanded ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                </button>
                
                <div className="flex items-center gap-2 relative">
                    {/* History Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowHistory(!showHistory);
                        }}
                        className={`p-1.5 rounded-md transition-colors ${showHistory ? 'bg-blue-500/20 text-blue-400' : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'}`}
                        title="Version History"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74-2.74L3 12"/><path d="M3 3v9h9"/><polyline points="12 7 12 12 15 15"/></svg>
                    </button>

                    {!isExpanded && (
                        <span 
                            className="text-[10px] text-slate-600 font-mono truncate max-w-[150px] opacity-75 cursor-pointer"
                            onClick={() => toggleSection(id)}
                        >
                            {value.replace(/\n/g, ' ').substring(0, 30)}...
                        </span>
                    )}

                    {/* History Dropdown */}
                    {showHistory && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)}></div>
                            <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                <div className="p-3 border-b border-slate-800 bg-slate-950/50">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Version History</h4>
                                    <p className="text-[10px] text-slate-600 mt-1">Select to restore a previous version</p>
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {history.length === 0 ? (
                                        <div className="p-4 text-center text-xs text-slate-600 italic">No history yet. Run an inspection to save versions.</div>
                                    ) : (
                                        history.map((histText, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setValue(histText);
                                                    setShowHistory(false);
                                                }}
                                                className="w-full text-left p-3 hover:bg-slate-800 border-b border-slate-800/50 last:border-0 transition-colors group/item"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">v{history.length - idx}</span>
                                                    {histText === value && (
                                                        <span className="text-[10px] text-emerald-500 font-bold">Active</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 line-clamp-2 font-mono opacity-80 group-hover/item:opacity-100">
                                                    {histText}
                                                </p>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
             </div>
             
             {isExpanded && (
                 <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                    <textarea
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={onKeyDown}
                        disabled={isLoading}
                        className={`w-full ${heightClass} p-4 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 resize-y font-mono text-base leading-relaxed transition-all shadow-inner`}
                        placeholder={placeholder}
                        autoFocus
                    />
                 </div>
             )}
        </div>
    );
};

const App: React.FC = () => {
  // Initialize prompt sections with robust persistent hooks
  const [role, setRole] = usePersistentString(STORAGE_KEYS.ROLE, DEFAULT_ROLE);
  const [criteria, setCriteria] = usePersistentString(STORAGE_KEYS.CRITERIA, DEFAULT_CRITERIA);
  const [attributes, setAttributes] = usePersistentString(STORAGE_KEYS.ATTRIBUTES, DEFAULT_ATTRIBUTES);
  const [format, setFormat] = usePersistentString(STORAGE_KEYS.FORMAT, DEFAULT_FORMAT);

  // Initialize History Hooks
  const roleHistory = useHistory(STORAGE_KEYS.ROLE, role);
  const criteriaHistory = useHistory(STORAGE_KEYS.CRITERIA, criteria);
  const attributesHistory = useHistory(STORAGE_KEYS.ATTRIBUTES, attributes);
  const formatHistory = useHistory(STORAGE_KEYS.FORMAT, format);

  // Visibility state for sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    role: false,
    criteria: true,
    attributes: false,
    format: false
  });

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [status, setStatus] = useState<SendingStatus>(SendingStatus.IDLE);
  const [responseText, setResponseText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [parsedDetections, setParsedDetections] = useState<Detection[] | null>(null);
  
  // Model Configuration State
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("LOW");
  const [temperature, setTemperature] = useState<number>(1.0); 
  
  // View State
  const [viewMode, setViewMode] = useState<'visual' | 'raw' | 'debug'>('visual');
  const [debugRequest, setDebugRequest] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files);
      
      try {
        const processedImages = await Promise.all(newFiles.map(processFile));
        setImages(prev => [...prev, ...processedImages]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        console.error("Error processing files", err);
        setErrorMsg("Failed to process some images.");
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAllImages = () => {
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const constructFullPrompt = () => {
    return `## ROLE & OBJECTIVE
${role}

## VISUAL DEFECT CRITERIA
${criteria}

## ATTRIBUTE DEFINITIONS
${attributes}

## OUTPUT FORMAT INSTRUCTIONS
${format}`;
  };

  const prepareDebugInfo = (fullPrompt: string) => {
      // Reconstruct the payload object for debug display
      // We manually build this to match what the service sends, but replacing base64 data
      const parts: any[] = images.map(img => ({
        inlineData: {
          mimeType: img.mimeType,
          data: "[BASE64_IMAGE_DATA_OMITTED_FOR_DEBUG_VIEW]"
        }
      }));

      parts.push({ text: fullPrompt });

      const debugPayload = {
          model: 'gemini-3-pro-preview',
          contents: {
              parts: parts
          },
          config: {
              temperature: temperature,
              thinkingConfig: { 
                  thinkingBudget: thinkingLevel === 'HIGH' ? 16000 : 2000
              },
              responseMimeType: "application/json",
              responseSchema: detectionSchema
          }
      };

      setDebugRequest(JSON.stringify(debugPayload, null, 2));
  };

  const handleSubmit = async () => {
    const fullPrompt = constructFullPrompt();
    if (!fullPrompt.trim()) {
      setErrorMsg("Prompt is empty.");
      return;
    }
    
    // Commit current prompts to history before running
    roleHistory.commit();
    criteriaHistory.commit();
    attributesHistory.commit();
    formatHistory.commit();

    setStatus(SendingStatus.LOADING);
    setResponseText("");
    setParsedDetections(null);
    setErrorMsg(null);
    setViewMode('visual');
    prepareDebugInfo(fullPrompt);

    try {
      const text = await generateContentWithGemini(fullPrompt, images, {
        thinkingLevel,
        temperature
      });
      setResponseText(text);

      // Parse JSON directly since we are using controlled generation
      try {
        const json = JSON.parse(text);
        
        if (Array.isArray(json)) {
            setParsedDetections(json as Detection[]);
            setViewMode('visual');
        } else {
            // Should not happen with current schema, but handle object wrapper just in case
            if (json.items && Array.isArray(json.items)) {
                setParsedDetections(json.items as Detection[]);
                setViewMode('visual');
            } else {
                setViewMode('raw');
            }
        }
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        setViewMode('raw');
      }

      setStatus(SendingStatus.SUCCESS);
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong.");
      setStatus(SendingStatus.ERROR);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({
        ...prev,
        [key]: !prev[key]
    }));
  };

  const isLoading = status === SendingStatus.LOADING;

  const getFormattedContent = () => {
    try {
        if (parsedDetections && !responseText.trim().startsWith('```')) {
            return "```json\n" + JSON.stringify(JSON.parse(responseText), null, 2) + "\n```";
        }
    } catch (e) {}
    return responseText;
  };

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-200 overflow-hidden">
      
      {/* COLUMN 1: Assets & Configuration (Left Sidebar) */}
      <div className="w-[320px] flex flex-col h-full border-r border-slate-800 bg-slate-950 shrink-0 z-20">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 select-none">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              Gemini 3 Inspector
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            v0.9 • Preview Model
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-6">
            
            {/* Image Upload */}
            <div>
                <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Images</label>
                    {images.length > 0 && !isLoading && (
                        <button onClick={handleClearAllImages} className="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold">Clear</button>
                    )}
                </div>
                
                <ImagePreviewGrid images={images} onRemove={handleRemoveImage} disabled={isLoading} />

                <input type="file" multiple accept="image/*" onChange={handleFileChange} className="hidden" ref={fileInputRef} disabled={isLoading} />
                
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={`w-full h-24 border border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition-all group
                    ${isLoading ? 'border-slate-800 opacity-50' : 'border-slate-700 bg-slate-900/30 hover:border-blue-500/50 hover:bg-slate-900 cursor-pointer'}
                    `}
                >
                    <span className="text-xs text-slate-500 font-medium group-hover:text-blue-400">Add Images</span>
                </button>
            </div>

            {/* Model Config */}
            <div>
                <div className="flex items-center gap-2 text-slate-400 mb-3 border-t border-slate-800 pt-6">
                    <span className="text-xs font-bold uppercase tracking-wider">Configuration</span>
                </div>

                <div className="space-y-4">
                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                        <label className="text-[10px] font-medium text-slate-500 mb-2 block uppercase">Thinking Level</label>
                        <div className="flex bg-slate-800 p-1 rounded-md">
                            <button onClick={() => setThinkingLevel('LOW')} className={`flex-1 py-1 text-xs font-medium rounded transition-all ${thinkingLevel === 'LOW' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Low</button>
                            <button onClick={() => setThinkingLevel('HIGH')} className={`flex-1 py-1 text-xs font-medium rounded transition-all ${thinkingLevel === 'HIGH' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>High</button>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-[10px] font-medium text-slate-500 uppercase">Temperature</label>
                            <span className="text-[10px] font-mono text-emerald-400">{temperature.toFixed(1)}</span>
                        </div>
                        <input type="range" min="0" max="2.0" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} disabled={isLoading} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                    </div>
                </div>
            </div>

        </div>
        {/* Footer Removed from here */}
      </div>

      {/* COLUMN 2: Prompt Engineering (Middle Wide) */}
      <div className="w-[600px] lg:w-[800px] xl:w-[900px] 2xl:w-[1100px] flex flex-col h-full border-r border-slate-800 bg-slate-950/30 shrink-0 z-10">
         <div className="p-6 border-b border-slate-800/50 flex justify-between items-center bg-slate-950/80 backdrop-blur-sm">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
                Prompt Engineering
            </h2>
            <div className="text-[10px] text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                CTRL + ENTER to Run
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            <PromptSection 
                id="role"
                label="Role & Objective" 
                value={role} 
                setValue={setRole} 
                isExpanded={expandedSections.role}
                toggleSection={toggleSection}
                isLoading={isLoading}
                onKeyDown={handleKeyDown}
                history={roleHistory.history}
                heightClass="h-48" 
            />
            
            <PromptSection 
                id="criteria"
                label="Visual Defect Criteria" 
                value={criteria} 
                setValue={setCriteria}
                isExpanded={expandedSections.criteria}
                toggleSection={toggleSection}
                isLoading={isLoading}
                onKeyDown={handleKeyDown}
                history={criteriaHistory.history}
                heightClass="h-96" 
            />

            <PromptSection 
                id="attributes"
                label="Attribute Definitions" 
                value={attributes} 
                setValue={setAttributes}
                isExpanded={expandedSections.attributes}
                toggleSection={toggleSection}
                isLoading={isLoading}
                onKeyDown={handleKeyDown}
                history={attributesHistory.history}
                heightClass="h-64" 
            />

            <PromptSection 
                id="format"
                label="Output Format Instructions" 
                value={format} 
                setValue={setFormat}
                isExpanded={expandedSections.format}
                toggleSection={toggleSection}
                isLoading={isLoading}
                onKeyDown={handleKeyDown}
                history={formatHistory.history}
                heightClass="h-64" 
            />
         </div>

         {/* Start Button Moved Here */}
         <div className="p-4 border-t border-slate-800 bg-slate-950">
            <button
                onClick={handleSubmit}
                disabled={isLoading || (images.length === 0)}
                className={`w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center justify-center gap-2
                ${isLoading ? 'bg-blue-600/20 text-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'}
                `}
            >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : 'Run Inspection'}
            </button>
         </div>
      </div>

      {/* COLUMN 3: Results (Right Fluid) */}
      <div className="flex-1 flex flex-col h-full bg-slate-900 relative overflow-hidden min-w-[300px]">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]"></div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 lg:p-12 relative z-10">
          {!responseText && !isLoading && !errorMsg && (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 select-none">
              <div className="w-20 h-20 mb-6 rounded-3xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-center shadow-2xl">
                 <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                 </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-400 mb-2">Ready to Inspect</h2>
              <p className="max-w-md text-center text-slate-500">Configure your model and prompt on the left, then run the inspection to see results here.</p>
            </div>
          )}

          {isLoading && (
            <div className="h-full flex flex-col items-center justify-center">
               <div className="relative">
                  <div className="w-16 h-16 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                     <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  </div>
               </div>
               <p className="mt-8 text-blue-400 font-medium animate-pulse tracking-wide">PROCESSING</p>
               <p className="mt-2 text-slate-500 text-sm">Thinking Level: <span className="text-slate-400">{thinkingLevel}</span></p>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
              </svg>
              <div>
                  <h4 className="font-bold mb-1">Error during generation</h4>
                  <p className="opacity-90">{errorMsg}</p>
              </div>
            </div>
          )}

          {responseText && (
            <div className="max-w-5xl mx-auto pb-12">
               <div className="mb-8 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-20 py-4 border-b border-slate-800/50">
                 <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono uppercase tracking-widest bg-emerald-950/30 px-3 py-1.5 rounded border border-emerald-900/50">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-[pulse_3s_infinite]"></span>
                        Done
                     </div>

                     <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700/50">
                        <button 
                            onClick={() => setViewMode('visual')}
                            disabled={!parsedDetections}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                viewMode === 'visual' 
                                ? 'bg-slate-600 text-white shadow' 
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                        >
                            Visual
                        </button>
                        <button 
                            onClick={() => setViewMode('raw')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                viewMode === 'raw' 
                                ? 'bg-slate-600 text-white shadow' 
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                            }`}
                        >
                            Raw
                        </button>
                        <button 
                            onClick={() => setViewMode('debug')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                viewMode === 'debug' 
                                ? 'bg-slate-600 text-white shadow' 
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                            }`}
                        >
                            Debug
                        </button>
                     </div>
                 </div>

                 <button 
                    onClick={() => navigator.clipboard.writeText(responseText)}
                    className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1.5"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    Copy
                 </button>
               </div>
               
               {/* Conditional Rendering */}
               {viewMode === 'visual' && parsedDetections ? (
                 <DetectionResult detections={parsedDetections} images={images} />
               ) : viewMode === 'debug' ? (
                 <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-auto">
                    <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">{debugRequest}</pre>
                 </div>
               ) : (
                 <div className="prose prose-invert prose-lg max-w-none">
                    <MarkdownRenderer content={getFormattedContent()} />
                 </div>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;