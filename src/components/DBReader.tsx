import React, { useState, useEffect, useMemo } from 'react';
import initSqlJs, { Database, SqlValue } from 'sql.js';
import { 
  Table, 
  Play, 
  Search, 
  AlertCircle, 
  Clock, 
  ChevronRight, 
  ChevronLeft, 
  Database as DatabaseIcon, 
  History, 
  BookOpen, 
  CheckCircle, 
  X, 
  SlidersHorizontal, 
  Columns, 
  Key, 
  Compass,
  ArrowRight
} from 'lucide-react';
import { TableData, QueryResult } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ERDiagram } from './ERDiagram';

interface DBReaderProps {
  file: File;
  onClose: () => void;
}

export function DBReader({ file, onClose }: DBReaderProps) {
  const [db, setDb] = useState<Database | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  
  // Table view state
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tablePage, setTablePage] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPageSize, setCurrentPageSize] = useState(50);
  const [jumpPageInput, setJumpPageInput] = useState('1');
  
  // Custom query state
  const [customQuery, setCustomQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<'browse' | 'query' | 'schema' | 'erd'>('browse');

  const [schemaInfo, setSchemaInfo] = useState<{name: string, sql: string}[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);

  // New Productivity State
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [browseSearch, setBrowseSearch] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState(''); // Holds search applied to database
  const [schemaSearch, setSchemaSearch] = useState('');
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load Database
  useEffect(() => {
    let mounted = true;

    async function loadDb() {
      try {
        const SQL = await initSqlJs({
          locateFile: file => `https://unpkg.com/sql.js@1.14.1/dist/${file}`
        });

        const buffer = await file.arrayBuffer();
        if (!mounted) return;
        
        const database = new SQL.Database(new Uint8Array(buffer));
        setDb(database);
        
        // Fetch tables
        const res = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        if (res.length > 0) {
          const tableNames = res[0].values.map(v => v[0] as string);
          setTables(tableNames);
          
          if (tableNames.length > 0) {
            setSelectedTable(tableNames[0]);
          }
        }

        // Fetch schema definitions
        const schemaRes = database.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        if (schemaRes.length > 0) {
          setSchemaInfo(schemaRes[0].values.map(v => ({ name: v[0] as string, sql: v[1] as string })));
        }
        
      } catch (err: any) {
        console.error("Failed to load database:", err);
        setDbError(err.message || "Failed to load database file");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadDb();

    return () => {
      mounted = false;
      if (db) db.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Read data whenever table, page, applied search term or page size changes
  useEffect(() => {
    if (db && selectedTable) {
      loadTableData(selectedTable, tablePage, activeSearchTerm, currentPageSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, selectedTable, tablePage, activeSearchTerm, currentPageSize]);

  // Keep pagination jump input synchronised with tablePage
  useEffect(() => {
    setJumpPageInput(String(tablePage + 1));
  }, [tablePage]);

  // Handle selectedTable changes - reset search and page
  const handleSelectTable = (tblName: string) => {
    setSelectedTable(tblName);
    setBrowseSearch('');
    setActiveSearchTerm('');
    setTablePage(0);
  };

  // SQL-backed High-efficiency Searching inside tables (filtering columns dynamically)
  const loadTableData = (tableName: string, page: number, searchKeyword: string = '', pageSize: number = currentPageSize) => {
    if (!db) return;
    
    try {
      const offset = page * pageSize;
      
      // Step 1: Discover columns via table schema properties with standard index lookup or PRAGMA
      const infoRes = db.exec(`PRAGMA table_info("${tableName}")`);
      let columns: string[] = [];
      if (infoRes.length > 0) {
        columns = infoRes[0].values.map(v => v[1] as string);
      }

      // If PRAGMA didn't return columns, find them dynamically via visual empty queries
      if (columns.length === 0) {
        try {
          const peekRes = db.exec(`SELECT * FROM "${tableName}" LIMIT 0`);
          if (peekRes.length > 0) {
            columns = peekRes[0].columns;
          }
        } catch (e) {}
      }

      let countQuery = `SELECT COUNT(*) FROM "${tableName}"`;
      let dataQuery = `SELECT * FROM "${tableName}"`;
      
      // Step 2: Build search query conditions scanning text-based columns via OR-LIKE definitions
      if (searchKeyword.trim() && columns.length > 0) {
        const escapedKeyword = searchKeyword.replace(/'/g, "''"); // SQL quote escaping
        const whereClause = columns.map(col => `"${col}" LIKE '%${escapedKeyword}%'`).join(' OR ');
        countQuery += ` WHERE ${whereClause}`;
        dataQuery += ` WHERE ${whereClause}`;
      }

      // Execute row counting
      const countRes = db.exec(countQuery);
      let totalCount = 0;
      if (countRes.length > 0) {
        totalCount = countRes[0].values[0][0] as number;
      }
      setTableCount(totalCount);

      // Execute data retrieval
      dataQuery += ` LIMIT ${pageSize} OFFSET ${offset}`;
      const dataRes = db.exec(dataQuery);
      
      if (dataRes.length > 0) {
        setTableData({
          columns: dataRes[0].columns,
          values: dataRes[0].values
        });
      } else {
        setTableData({
          columns: columns.length > 0 ? columns : [],
          values: []
        });
      }
      
    } catch (err) {
      console.error("SQL Error during browse loading: ", err);
      setTableData({ columns: [], values: [] });
      setTableCount(0);
    }
  };

  const executeBrowseSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTablePage(0);
    setActiveSearchTerm(browseSearch);
  };

  const clearBrowseSearch = () => {
    setBrowseSearch('');
    setActiveSearchTerm('');
    setTablePage(0);
  };

  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    const totalPages = Math.max(1, Math.ceil(tableCount / currentPageSize));
    const targetPage = parseInt(jumpPageInput, 10);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
      setTablePage(targetPage - 1);
    } else {
      setJumpPageInput(String(tablePage + 1));
    }
  };

  // Run Custom Query Scratchpad
  const handleExecuteQuery = (queryText: string = customQuery) => {
    if (!db || !queryText.trim()) return;
    
    const startTime = performance.now();
    try {
      const res = db.exec(queryText);
      const timeMs = Math.round(performance.now() - startTime);
      
      setQueryResult({
        data: res.map(r => ({ columns: r.columns, values: r.values })),
        timeMs
      });

      // Update Query History list seamlessly
      setQueryHistory(prev => {
        const filtered = prev.filter(q => q.trim() !== queryText.trim());
        return [queryText.trim(), ...filtered].slice(0, 15); // keep last 15 queries
      });

      // Quick trigger success alert effect
      setSuccessMessage("Query executed successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err: any) {
      const timeMs = Math.round(performance.now() - startTime);
      setQueryResult({
        data: [],
        error: err.message || "Query failed",
        timeMs
      });
    }
  };

  const loadQueryTemplate = (template: string) => {
    setCustomQuery(template);
    setActiveTab('query');
  };

  const formatValue = (val: SqlValue) => {
    if (val === null) return <span className="text-slate-400 italic font-mono text-xs">NULL</span>;
    if (typeof val === 'number') return <span className="text-blue-600 font-mono font-medium">{val}</span>;
    if (typeof val === 'string') return <span className="text-slate-700 whitespace-pre-wrap">{val}</span>;
    if (val instanceof Uint8Array) return <span className="text-orange-500 font-mono">[Blob {val.length}B]</span>;
    return String(val);
  };

  // Filter lists in client-side real-time
  const filteredTablesBySearch = useMemo(() => {
    if (!sidebarFilter.trim()) return tables;
    const term = sidebarFilter.toLowerCase().trim();
    return tables.filter(t => t.toLowerCase().includes(term));
  }, [tables, sidebarFilter]);

  const filteredSchemaInfo = useMemo(() => {
    if (!schemaSearch.trim()) return schemaInfo;
    const term = schemaSearch.toLowerCase().trim();
    return schemaInfo.filter(info => 
      info.name.toLowerCase().includes(term) || 
      info.sql.toLowerCase().includes(term)
    );
  }, [schemaInfo, schemaSearch]);

  // SQL scratchpad templates collection
  const SQL_TEMPLATES = [
    {
      title: "Count rows in all tables",
      query: `-- Count records on tables dynamically\nSELECT name, (SELECT count(*) FROM sqlite_master) as tables_count FROM sqlite_master WHERE type='table';`
    },
    {
      title: "Active DB tables listing",
      query: `SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;`
    },
    {
      title: "Database Index Audit",
      query: `SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' ORDER BY tbl_name;`
    },
    {
      title: "Show columns details for table",
      query: `-- Replace 'mst_invoice' with target table name to see definitions\nPRAGMA table_info('mst_invoice');`
    },
    {
      title: "Check ForeignKey associations",
      query: `-- Analyze constraints relating target dependencies\nPRAGMA foreign_key_list('mst_invoice');`
    },
    {
      title: "Quick View first 50 tables",
      query: `-- Direct SQLite configuration check\nSELECT * FROM sqlite_sequence;`
    }
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
          <p className="text-slate-500 font-medium text-sm">Parsing SQLite Database binary file...</p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="max-w-md p-6 bg-white rounded-xl shadow-sm border border-red-100 flex flex-col items-center text-center gap-4">
          <div className="p-3 bg-red-50 text-red-500 rounded-full">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Cannot Read Database</h2>
          <p className="text-slate-600 text-sm mb-4">{dbError}</p>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const activeTablePageCount = Math.max(1, Math.ceil(tableCount / currentPageSize));

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-[#1e293b] font-sans">
      
      {/* Dynamic Tables Selection Sidebar (Optimized for 120+ entities) */}
      <div className="w-[280px] bg-slate-900 flex flex-col border-r border-slate-800 shrink-0">
        
        {/* Header summary of selected resource */}
        <div className="p-4 border-b border-slate-800 relative">
          <h1 className="text-[13px] font-semibold uppercase tracking-wider text-slate-300 truncate pr-6" title={file.name}>
            {file.name}
          </h1>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
            <DatabaseIcon size={12} className="text-blue-500" />
            <span>SQLite Local DB File</span>
          </div>
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors text-lg line-none"
            title="Eject / Close Database"
          >
            <X size={14} />
          </button>
        </div>

        {/* Live Filter bar across 120+ tables */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/40">
          <div className="relative">
            <input
              type="text"
              placeholder={`Filter ${tables.length} tables...`}
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
              className="w-full bg-slate-800/85 text-slate-100 placeholder-slate-500 rounded-md px-3 py-1.5 pl-8 text-[12px] border border-slate-700/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all font-medium"
            />
            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500" />
            {sidebarFilter && (
              <button
                onClick={() => setSidebarFilter('')}
                className="absolute right-2 px-1 text-slate-500 hover:text-white text-xs top-1.5 transition-colors"
                title="Clear Filters"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {sidebarFilter.trim() && (
            <div className="mt-1.5 text-[10px] text-slate-400 font-mono text-right font-medium">
              Found {filteredTablesBySearch.length} matches
            </div>
          )}
        </div>
        
        {/* Safe Scroll-container with active highlighted status tracking */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center justify-between">
            <span>TABLES LIST</span>
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[9px] text-slate-300 font-mono">
              {filteredTablesBySearch.length}
            </span>
          </div>
          <div className="flex flex-col">
            {filteredTablesBySearch.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-xs italic bg-slate-950/10 rounded m-2 border border-slate-800/50">
                No matching tables found
              </div>
            ) : (
              filteredTablesBySearch.map(table => (
                <button
                  key={table}
                  onClick={() => handleSelectTable(table)}
                  className={`w-full flex items-center justify-between px-4 py-2 text-left text-[12.5px] transition-all duration-150 border-l-[3px] group ${
                    selectedTable === table && activeTab === 'browse'
                      ? 'bg-blue-600/15 border-blue-500 text-blue-400 font-medium scale-[0.99] shadow-sm' 
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Table size={13} className={selectedTable === table && activeTab === 'browse' ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'} />
                    <span className="truncate" title={table}>{table}</span>
                  </div>
                  <ChevronRight size={12} className={`opacity-0 transition-opacity group-hover:opacity-100 shrink-0 text-slate-600 ${selectedTable === table && activeTab === 'browse' ? 'text-blue-400 opacity-100' : ''}`} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Panel space with navigational workspace controls */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        
        {/* Global Toolbar and Workspace Tab Switch */}
        <div className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 relative shadow-sm z-20">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded">
              <DatabaseIcon size={16} />
            </div>
            <strong className="text-[13.5px] font-semibold text-slate-800 truncate" title={file.name}>{file.name}</strong>
            <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-semibold font-mono tracking-wider">
              OFFLINE READONLY
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'browse' 
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Table size={13} />
              Browse Data
            </button>
            <button
              onClick={() => setActiveTab('schema')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'schema' 
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <SlidersHorizontal size={13} />
              Schema
            </button>
            <button
              onClick={() => setActiveTab('erd')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'erd' 
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Compass size={13} />
              ER Diagram
            </button>
            <button
              onClick={() => setActiveTab('query')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'query' 
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Play size={13} />
              SQL Editor
            </button>
          </div>
        </div>

        {/* Content area backed with motion layout rendering engines */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            
            {/* BROWSE TAB */}
            {activeTab === 'browse' && (
              <motion.div 
                key="browse"
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col p-5"
              >
                {!selectedTable ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 border border-dashed border-slate-200 rounded-xl bg-white m-4">
                    <DatabaseIcon size={32} className="text-slate-300 animate-pulse" />
                    <p className="text-sm font-medium">Select a table from the left sidebar to start browsing</p>
                  </div>
                ) : (
                  <>
                    {/* Navigation Filter with search optimizations & page sizes selection */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
                      
                      {/* Name Summary and interactive row estimates */}
                      <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
                        <div className="h-9 w-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold">
                          {selectedTable[0].toUpperCase()}
                        </div>
                        <div>
                          <h2 className="font-bold text-slate-800 text-[15px] max-w-[220px] truncate" title={selectedTable}>
                            {selectedTable}
                          </h2>
                          <div className="text-xs text-slate-400 font-mono">
                            {tableCount.toLocaleString()} total row{tableCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>

                      {/* SQL text search field across rows (Productivity booster) */}
                      <form onSubmit={executeBrowseSearch} className="flex items-center gap-1 flex-1 max-w-lg w-full">
                        <div className="relative flex-1">
                          <input 
                            type="text"
                            placeholder="SQL Search in active table..."
                            value={browseSearch}
                            onChange={(e) => setBrowseSearch(e.target.value)}
                            className="w-full text-xs font-medium pl-8 pr-8 py-2 border border-slate-200 rounded-lg bg-[#fafafa] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder-slate-400"
                          />
                          <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                          {browseSearch && (
                            <button
                              type="button"
                              onClick={clearBrowseSearch}
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-800"
                              title="Clear search"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <button
                          type="submit"
                          className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm shrink-0 transition"
                        >
                          Find
                        </button>
                      </form>

                      {/* Pagination Controls */}
                      <div className="flex items-center gap-4 shrink-0 justify-end w-full md:w-auto self-end md:self-auto border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                        {/* Custom size settings dropdown */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400 font-medium">Size:</span>
                          <select
                            value={currentPageSize}
                            onChange={(e) => {
                              setCurrentPageSize(Number(e.target.value));
                              setTablePage(0);
                            }}
                            className="border border-slate-200 rounded-lg text-[11px] font-bold py-1 px-1.5 focus:border-blue-500 bg-white"
                          >
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={200}>200</option>
                            <option value={500}>500</option>
                          </select>
                        </div>

                        {/* Pagination Prev/Next triggers with responsive touch sizes */}
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => setTablePage(prev => Math.max(0, prev - 1))}
                            disabled={tablePage === 0}
                            className="p-1.5 border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            title="Previous Page"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          
                          {/* Page Jump Form to bypass nested page clicks */}
                          <form onSubmit={handlePageJump} className="flex items-center gap-1">
                            <input
                              type="text"
                              value={jumpPageInput}
                              onChange={(e) => setJumpPageInput(e.target.value)}
                              className="w-10 text-center border border-slate-200 rounded-md py-0.5 px-1 font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                            <span className="text-[11px] font-bold text-slate-400">
                              / {activeTablePageCount}
                            </span>
                          </form>

                          <button 
                            type="button"
                            onClick={() => setTablePage(prev => Math.min(activeTablePageCount - 1, prev + 1))}
                            disabled={(tablePage + 1) * currentPageSize >= tableCount}
                            className="p-1.5 border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            title="Next Page"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>

                    </div>
                    
                    {/* Database active rows list container with robust double-bordered layout */}
                    <div className="flex-1 overflow-auto border border-slate-200 bg-white rounded-xl shadow-inner relative max-w-full">
                      {tableData && tableData.columns.length > 0 ? (
                        tableData.values.length > 0 ? (
                          <div className="w-full h-full overflow-auto">
                            <table className="w-full text-left border-collapse table-auto min-w-max">
                              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-sm">
                                <tr>
                                  <th className="px-4 py-3 text-[10.5px] font-bold text-slate-400 bg-slate-50 border-r border-slate-150 uppercase tracking-wider text-center w-12">
                                    #
                                  </th>
                                  {tableData.columns.map((col, idx) => (
                                    <th key={idx} className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 border-b border-r border-slate-150 last:border-r-0 truncate">
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {tableData.values.map((row, rowIdx) => (
                                  <tr key={rowIdx} className="hover:bg-blue-50/20 active:bg-blue-50/10 transition-colors">
                                    <td className="px-2 py-3.5 text-[10px] font-mono text-slate-400 text-center border-r border-slate-100">
                                      {tablePage * currentPageSize + rowIdx + 1}
                                    </td>
                                    {row.map((val, colIdx) => (
                                      <td key={colIdx} className="px-5 py-3.5 text-xs text-slate-600 border-r border-slate-100 last:border-r-0 max-w-xs truncate" title={String(val)}>
                                        {formatValue(val)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-white m-4 rounded">
                            <Search size={28} className="text-slate-300 mb-2" />
                            <h3 className="text-sm font-semibold text-slate-700">No rows matched filter</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Attempt adjusting search arguments or clearing queries.</p>
                            <button
                              onClick={clearBrowseSearch}
                              className="mt-3 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-xs font-semibold"
                            >
                              Clear Search Filter
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="p-8 text-center text-slate-400 italic text-[12.5px] h-full flex items-center justify-center">
                          Cannot access column properties for table "{selectedTable}".
                        </div>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* ER DIAGRAM TAB */}
            {activeTab === 'erd' && (
              <motion.div 
                key="erd"
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col overflow-hidden bg-white"
              >
                <ERDiagram schemaInfo={schemaInfo} />
              </motion.div>
            )}

            {/* SCHEMA SEARCH TAB (Optimized for finding tables and references in 120 tables) */}
            {activeTab === 'schema' && (
              <motion.div 
                key="schema"
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col p-6 overflow-hidden bg-slate-50"
              >
                {/* Search controller cards */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-5 flex flex-col sm:flex-row items-center gap-3 shrink-0">
                  <div className="relative flex-1 w-full">
                    <input
                      type="text"
                      placeholder="Search schemas (e.g., 'invoice_id', 'PRIMARY KEY', 'VARCHAR')..."
                      value={schemaSearch}
                      onChange={(e) => setSchemaSearch(e.target.value)}
                      className="w-full text-xs font-semibold pl-9 pr-8 py-2.5 border border-slate-200 rounded-lg bg-[#fafafa] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-slate-400"
                    />
                    <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                    {schemaSearch && (
                      <button
                        onClick={() => setSchemaSearch('')}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-slate-400 bg-slate-100 font-bold border rounded-lg px-3 py-2.5 w-full sm:w-auto text-center font-mono">
                    Showing {filteredSchemaInfo.length} of {schemaInfo.length} tables
                  </div>
                </div>

                {/* Grid Lists */}
                <div className="flex-1 overflow-y-auto space-y-4">
                  {filteredSchemaInfo.length === 0 ? (
                    <div className="border border-slate-200 rounded-xl bg-white p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                      <SlidersHorizontal size={32} className="text-slate-300" />
                      <p className="font-semibold text-slate-700 text-sm">No schema matched search parameters</p>
                      <button onClick={() => setSchemaSearch('')} className="mt-2 text-xs text-blue-600 font-bold hover:underline">
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    filteredSchemaInfo.map(info => (
                      <div key={info.name} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition duration-150">
                        <div className="px-4 py-2.5 border-b border-indigo-50/50 bg-[#fafbfe] flex items-center justify-between">
                           <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-[13px] font-mono">
                             <Table size={13} className="text-blue-500" />
                             {info.name}
                           </h3>
                           <button
                             onClick={() => {
                               setSelectedTable(info.name);
                               setActiveTab('browse');
                             }}
                             className="text-[10px] text-blue-600 hover:text-blue-700 font-bold tracking-wide flex items-center gap-1 bg-blue-100/50 hover:bg-blue-150 rounded px-2.5 py-1"
                           >
                             Explore Row Data &rarr;
                           </button>
                        </div>
                        <div className="p-4 bg-slate-900 border-t border-slate-800 overflow-x-auto text-[11.5px] leading-relaxed font-mono text-slate-300">
                          <pre className="selection:bg-slate-700 select-all">{info.sql}</pre>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* SQL SCRATCHPAD / QUERY TAB */}
            {activeTab === 'query' && (
              <motion.div 
                key="query"
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col md:flex-row overflow-hidden bg-slate-50"
              >
                {/* Visual scratchpad panel and query editor space */}
                <div className="flex-1 flex flex-col border-r border-slate-200 overflow-hidden">
                  <div className="p-4 px-6 border-b border-slate-200 bg-white shrink-0 relative">
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                         <Play size={10} /> write query below
                       </label>
                       {selectedTable && (
                         <button
                           onClick={() => setCustomQuery(`SELECT * FROM "${selectedTable}" LIMIT 100;`)}
                           className="text-[10px] text-blue-600 hover:text-blue-700 font-bold"
                         >
                           Paste SELECT active table template
                         </button>
                       )}
                    </div>
                    
                    <div className="relative">
                      <textarea
                        value={customQuery}
                        onChange={(e) => setCustomQuery(e.target.value)}
                        placeholder="SELECT * FROM table_name LIMIT 10;"
                        className="w-full font-mono text-xs p-3 border border-slate-200 rounded-lg text-slate-800 bg-[#fafafa] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[140px] resize-y selection:bg-blue-100 font-medium"
                      />
                      <div className="flex items-center justify-between mt-2.5">
                         {successMessage ? (
                            <span className="text-green-600 text-[11px] font-bold flex items-center gap-1">
                              <CheckCircle size={12} /> {successMessage}
                            </span>
                         ) : <span />}

                         <div className="flex items-center gap-2">
                           <button
                             onClick={() => setCustomQuery('')}
                             className="px-3 py-1.5 text-slate-500 text-xs hover:text-slate-800 font-semibold hover:bg-slate-100 rounded-md transition"
                           >
                             Reset Scratchpad
                           </button>
                           <button
                             onClick={() => handleExecuteQuery()}
                             className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2 transition-colors disabled:opacity-40"
                             disabled={!customQuery.trim()}
                           >
                             <Play size={12} fill="currentColor" /> Execute Script
                           </button>
                         </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Results box */}
                  <div className="flex-1 flex flex-col p-6 overflow-hidden">
                    {queryResult ? (
                      queryResult.error ? (
                        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                          <AlertCircle size={18} className="shrink-0 mt-0.5" />
                          <div className="font-mono text-xs">{queryResult.error}</div>
                        </div>
                      ) : (
                        <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="h-10 border-b border-slate-205 bg-slate-50 flex items-center justify-between px-4 text-slate-500 shrink-0 text-[11px] font-semibold dark:border-slate-100 font-sans">
                            <div className="flex items-center gap-4">
                              <span className="flex items-center gap-1"><Clock size={12} /> {queryResult.timeMs}ms</span>
                              <span>{queryResult.data[0]?.values.length || 0} rows evaluated</span>
                            </div>
                            <span className="text-green-600 text-[10px] font-bold tracking-widest uppercase">SUCCESS</span>
                          </div>
                          
                          <div className="flex-1 overflow-auto max-w-full">
                             {queryResult.data.length > 0 ? (
                               queryResult.data.map((resultBatch, bIdx) => (
                                 <div key={bIdx} className="w-full">
                                   <table className="w-full text-left border-collapse table-auto min-w-max">
                                      <thead className="sticky top-0 bg-slate-50 z-10">
                                        <tr>
                                          {resultBatch.columns.map((col, idx) => (
                                            <th key={idx} className="px-4 py-2.5 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider border-b-2 border-r border-slate-200 last:border-r-0 truncate bg-slate-50">
                                              {col}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {resultBatch.values.map((row, rowIdx) => (
                                          <tr key={rowIdx} className="hover:bg-slate-50 transition-colors">
                                            {row.map((val, colIdx) => (
                                              <td key={colIdx} className="px-4 py-2.5 text-xs text-slate-600 border-r border-slate-100 last:border-r-0 max-w-md truncate" title={String(val)}>
                                                {formatValue(val)}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                 </div>
                               ))
                             ) : (
                               <div className="p-8 text-slate-400 italic text-xs text-center">Query completed successfully. No records were returned back by binary engine.</div>
                             )}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white">
                        <Play size={24} className="opacity-40 mb-2" />
                        <p className="text-xs font-semibold">Ready to compile SQLite queries</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Write script formulas above, or load queries from sidebars templates.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Left/Right Sidebar panels tracking SQL Templates and Executed Session History details */}
                <div className="w-[280px] bg-slate-50 flex flex-col shrink-0 border-t md:border-t-0 border-slate-200 overflow-y-auto">
                  
                  {/* Database Template Section */}
                  <div className="p-4 border-b border-slate-200 bg-white">
                     <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex items-center gap-1.5 mb-2.5">
                       <BookOpen size={11} /> SQLite Templates
                     </h3>
                     <div className="space-y-1.5">
                       {SQL_TEMPLATES.map((item, idx) => (
                         <button
                           key={idx}
                           type="button"
                           onClick={() => loadQueryTemplate(item.query)}
                           className="w-full p-2.5 text-left bg-slate-50 hover:bg-blue-50/50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-lg text-[11.5px] font-medium text-slate-600 transition truncate flex items-center justify-between"
                         >
                           <span className="truncate">{item.title}</span>
                           <ArrowRight size={10} className="shrink-0 ml-1 opacity-60" />
                         </button>
                       ))}
                     </div>
                  </div>

                  {/* Executed Queries Session History list (Highly convenient desktop level utility) */}
                  <div className="p-4 flex-1">
                     <h3 className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex items-center gap-1.5 mb-2.5">
                       <History size={11} /> Scratchpad Session History
                     </h3>
                     {queryHistory.length === 0 ? (
                       <p className="text-[11px] text-slate-400 italic leading-normal pl-1">
                         Successfully compiled SQL lines in active session appear here for easy recall.
                       </p>
                     ) : (
                       <div className="space-y-2 max-h-[400px] overflow-y-auto">
                         {queryHistory.map((historyQuery, idx) => (
                           <button
                             key={idx}
                             type="button"
                             onClick={() => setCustomQuery(historyQuery)}
                             className="w-full p-2 bg-white rounded-lg border border-slate-200 hover:border-slate-350 transition text-left text-[11px] font-mono leading-tight hover:shadow-xs break-all"
                             title="Click to copy query text to editor scratchpad"
                           >
                             <div className="max-h-12 overflow-hidden truncate">
                               {historyQuery}
                             </div>
                           </button>
                         ))}
                       </div>
                     )}
                  </div>

                </div>

              </motion.div>
            )}
            
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
