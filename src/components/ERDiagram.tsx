import React, { useEffect, useRef, useState, useMemo } from 'react';
import mermaid from 'mermaid';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize, MousePointer2 } from 'lucide-react';

interface ERDiagramProps {
  schemaInfo: { name: string; sql: string }[];
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

export function ERDiagram({ schemaInfo }: ERDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredSchemaInfo = useMemo(() => {
    if (!searchTerm.trim()) return schemaInfo;
    const term = searchTerm.toLowerCase();
    // find tables that match the term
    const matchedTables = schemaInfo.filter(t => t.name.toLowerCase().includes(term));
    // also include tables that have relations to matched tables
    // so the diagram isn't broken
    return matchedTables; // keeping it simple: just show matching tables
  }, [schemaInfo, searchTerm]);

  const mermaidCode = useMemo(() => {
    let code = 'erDiagram\n';
    const allTableNames = filteredSchemaInfo.map(t => t.name);
    const implicitRelations: { from: string, to: string, col: string }[] = [];

    filteredSchemaInfo.forEach(table => {
      // Use quotes to support special characters
      code += `  "${table.name}" {\n`;
      
      // Try to extract column lines
      const columnMatches = table.sql.match(/\(([\s\S]*)\)/);
      if (columnMatches && columnMatches[1]) {
        const columnsStr = columnMatches[1];
        // Split by comma, but try to ignore commas in parentheses
        const columnLines = columnsStr.split(/,(?![^\(]*\))/);
        
        columnLines.forEach(line => {
           let cleanLine = line.trim();
           // ignore constraints
           if (cleanLine.toUpperCase().startsWith('PRIMARY KEY') || 
               cleanLine.toUpperCase().startsWith('FOREIGN KEY') || 
               cleanLine.toUpperCase().startsWith('UNIQUE') || 
               cleanLine.toUpperCase().startsWith('CONSTRAINT')) {
                 return;
           }
           
           // extract name and type
           cleanLine = cleanLine.replace(/['"`]/g, '');
           const parts = cleanLine.split(/\s+/);
           if (parts.length >= 2) {
             let colNameRaw = parts[0];
             let colTypeRaw = parts[1];
             
             // sanitize
             let colName = colNameRaw.replace(/[^a-zA-Z0-9_]/g, '');
             let colType = colTypeRaw.replace(/[^a-zA-Z0-9_]/g, '');
             if (colName && colType) {
                code += `    ${colType} ${colName}\n`;

                // Implicit FK check: if column ends with _id, try to find matching table
                if (colName.toLowerCase().endsWith('_id')) {
                    const possibleTableName = colName.toLowerCase().replace('_id', '');
                    const matchedTable = allTableNames.find(t => 
                        t.toLowerCase() === possibleTableName || 
                        t.toLowerCase() === `mst_${possibleTableName}`
                    );
                    if (matchedTable && matchedTable.toLowerCase() !== table.name.toLowerCase()) {
                        implicitRelations.push({ from: table.name, to: matchedTable, col: colNameRaw });
                    }
                }
             }
           }
        });
      }
      code += `  }\n\n`;

      // Try explicit foreign keys
      const fkRegex = /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+['"`]?(\w+)['"`]?\s*\(([^)]+)\)/gi;
      let match;
      while ((match = fkRegex.exec(table.sql)) !== null) {
          const colName = match[1].replace(/['"`\s]/g, '');
          const refTableRaw = match[2];
          // Find actual table name case if possible
          const refTableMatch = allTableNames.find(t => t.toLowerCase() === refTableRaw.toLowerCase());
          const refTable = refTableMatch || refTableRaw;
          code += `  "${refTable}" ||--o{ "${table.name}" : "${colName}"\n`;
          
          // Remove from implicit if explicit is found
          const idx = implicitRelations.findIndex(r => r.from === table.name && r.to.toLowerCase() === refTable.toLowerCase() && r.col === colName);
          if (idx !== -1) implicitRelations.splice(idx, 1);
      }
    });

    // Add remaining implicit relations
    implicitRelations.forEach(rel => {
        code += `  "${rel.to}" ||--o{ "${rel.from}" : "${rel.col}"\n`;
    });

    return code;
  }, [filteredSchemaInfo]);

  useEffect(() => {
    const renderDiagram = async () => {
      try {
        if (!mermaidCode || mermaidCode === 'erDiagram\n') {
            setSvgContent('');
            return;
        }
        setError(null);
        // unique id for mermaid render
        const id = `mermaid-erd-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidCode);
        // Make the svg scale properly by dropping the forced max-width
        const scaledSvg = svg.replace(/max-width:\s*\d+(\.\d+)?px;/gi, 'max-width: none;');
        setSvgContent(scaledSvg);
      } catch (err: any) {
        console.error('Mermaid rendering failed', err);
        setError('Failed to render ER Diagram. The schema might be too complex or contain unsupported syntax. Try filtering to fewer tables.');
      }
    };
    
    renderDiagram();
  }, [mermaidCode]);

  if (schemaInfo.length === 0) {
    return <div className="flex h-full items-center justify-center text-slate-500 italic">No schema information available</div>;
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <div className="absolute top-4 left-4 z-10 w-64">
        <input 
          type="text"
          placeholder="Filter tables..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
        <div className="mt-1 text-xs text-slate-500 drop-shadow-sm bg-white/80 rounded px-1 w-max">
          Showing {filteredSchemaInfo.length} of {schemaInfo.length} tables
        </div>
      </div>
      
      {error ? (
        <div className="p-4 bg-red-50 text-red-600 border-b border-red-100 z-10">{error}</div>
      ) : null}
      
      {/* Zoom / Pan Container */}
      <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative">
        <TransformWrapper
          initialScale={1}
          minScale={0.05}
          maxScale={10}
          centerOnInit={true}
          wheel={{ step: 0.1 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Floating Controls */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-1 flex flex-col gap-1">
                  <button 
                    onClick={() => zoomIn()} 
                    className="p-2 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => zoomOut()} 
                    className="p-2 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => resetTransform()} 
                    className="p-2 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition-colors"
                    title="Reset View"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                </div>
                <div className="bg-white/80 backdrop-blur-sm rounded px-3 py-1.5 shadow-sm border border-slate-200 text-[11px] font-medium text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
                  <MousePointer2 className="w-3 h-3" /> Scroll to zoom, drag to pan
                </div>
              </div>

              <TransformComponent wrapperClass="!w-full !max-w-full !h-full !max-h-full">
                <div 
                  ref={containerRef} 
                  className="w-full h-full flex items-center justify-center pointer-events-auto"
                  dangerouslySetInnerHTML={{ __html: svgContent }} 
                />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}
