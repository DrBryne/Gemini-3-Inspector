import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

// A simple renderer to handle basic markdown structure without heavy external libraries
// In a production app, you might use 'react-markdown'
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Simple paragraph splitting
  const paragraphs = content.split('\n\n').filter(Boolean);

  return (
    <div className="space-y-4 text-slate-300 leading-relaxed">
      {paragraphs.map((para, idx) => {
        // Basic header detection
        if (para.startsWith('### ')) {
          return <h3 key={idx} className="text-lg font-bold text-slate-100 mt-4 mb-2">{para.replace('### ', '')}</h3>;
        }
        if (para.startsWith('## ')) {
          return <h2 key={idx} className="text-xl font-bold text-blue-200 mt-6 mb-3">{para.replace('## ', '')}</h2>;
        }
        if (para.startsWith('# ')) {
          return <h1 key={idx} className="text-2xl font-bold text-white mt-6 mb-4">{para.replace('# ', '')}</h1>;
        }
        
        // Basic list detection
        if (para.trim().startsWith('- ') || para.trim().startsWith('* ')) {
            const items = para.split('\n').map(line => line.trim().substring(2));
            return (
                <ul key={idx} className="list-disc pl-5 space-y-1">
                    {items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
            )
        }
        
        // Code block detection (simplified)
        if (para.startsWith('```')) {
            const codeContent = para.replace(/```\w*\n?|```/g, '');
            return (
                <pre key={idx} className="bg-slate-900 p-4 rounded-lg overflow-x-auto text-sm font-mono text-emerald-400 border border-slate-700">
                    <code>{codeContent}</code>
                </pre>
            )
        }

        return <p key={idx} className="whitespace-pre-wrap">{para}</p>;
      })}
    </div>
  );
};
