import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { MessageCircle, Send, Globe, LayoutDashboard, User, Activity, Megaphone, Map, AlertTriangle, Volume2, Languages, RefreshCw, Clock, BookOpen, Search, Camera, Database, ChevronRight, Fingerprint } from 'lucide-react';

const SUPPORTED_LANGUAGES = [
  { name: 'English', code: 'en-US' }, { name: 'Hindi', code: 'hi-IN' }, { name: 'Tamil', code: 'ta-IN' }, { name: 'Telugu', code: 'te-IN' }, { name: 'Malayalam', code: 'ml-IN' }, { name: 'Spanish', code: 'es-ES' }, { name: 'French', code: 'fr-FR' }, { name: 'German', code: 'de-DE' }, { name: 'Japanese', code: 'ja-JP' }, { name: 'Korean', code: 'ko-KR' }
];

// Switch to your Render URL for production
const API_URL = "https://stadiumopsai.onrender.com";
const WS_URL = API_URL.replace(/^http/, 'ws');

const apiClient = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

function App() {
  const [currentView, setCurrentView] = useState('ops'); 
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);

  // Fan States
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Welcome to the FIFA 2026 AI Concierge. How can I assist you today?' }]);
  const [input, setInput] = useState('');
  const [fanLang, setFanLang] = useState('English');
  const [location, setLocation] = useState('Gate 1');
  const [destination, setDestination] = useState('Section 204');
  const [routeAdvice, setRouteAdvice] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Ops States
  const [dashboardData, setDashboardData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [forecastTime, setForecastTime] = useState(0); 
  const [draftMsg, setDraftMsg] = useState('');
  const [targetLang, setTargetLang] = useState('Spanish');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [oracleInput, setOracleInput] = useState('');
  const [oracleAnswer, setOracleAnswer] = useState(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [cctvLoading, setCctvLoading] = useState(false);
  const [cctvAlert, setCctvAlert] = useState(null);
  const [incidentLog, setIncidentLog] = useState([]); 

  const scrollToBottom = useCallback(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // --- EVENT-DRIVEN WEBSOCKETS ---
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "alert") {
          setActiveAnnouncement(data.payload);
          playAudio(data.payload.message, 'English');
        }
      } catch (e) { }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const loadVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
    loadVoices(); 
    if (window.speechSynthesis.onvoiceschanged !== undefined) window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const fetchDashboardMetrics = useCallback(async (minutes) => {
    try {
      setDashLoading(true);
      const res = await apiClient.get(`/api/dashboard?minutes=${minutes}`);
      setDashboardData(res.data);
      if (!activeAnnouncement) setActiveAnnouncement(res.data.active_announcement);
      const dbRes = await apiClient.get('/api/incidents');
      setIncidentLog(dbRes.data.incidents || []);
    } catch (err) { } finally { setDashLoading(false); }
  }, [activeAnnouncement]);

  useEffect(() => {
    if (currentView === 'ops') fetchDashboardMetrics(forecastTime);
  }, [currentView, forecastTime, fetchDashboardMetrics]);

  const playAudio = useCallback((text, langName) => {
    if (!window.speechSynthesis) return;
    const targetLangCode = SUPPORTED_LANGUAGES.find(l => l.name === langName)?.code || 'en-US';
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetLangCode;
    utterance.rate = 0.9; 
    if (availableVoices.length > 0) {
      let matchedVoice = availableVoices.find(v => v.lang === targetLangCode || v.lang.replace('_', '-') === targetLangCode) || availableVoices.find(v => v.lang.startsWith(targetLangCode.split('-')[0]));
      if (matchedVoice) utterance.voice = matchedVoice;
    }
    window.speechSynthesis.speak(utterance);
  }, [availableVoices]);

  const handleAPI = async (endpoint, payload, setter, loadingSetter) => {
    if (loadingSetter) loadingSetter(true);
    try {
      const res = await apiClient.post(`/api/${endpoint}`, payload);
      setter(res.data);
      if (endpoint === 'cctv/analyze') fetchDashboardMetrics(forecastTime);
    } catch (err) { setter({ error: true }); } 
    finally { if (loadingSetter) loadingSetter(false); }
  };

  const handleTranslate = () => draftMsg && handleAPI('translate', { text: draftMsg, target_language: targetLang }, (d) => setTranslatedText(d.translated_text || "Error"), setIsTranslating);
  const handleBroadcast = async () => {
    const textToPush = translatedText || draftMsg;
    if (!textToPush) return;
    await handleAPI('announcement', { message: textToPush, severity: 'critical' }, () => { setDraftMsg(''); setTranslatedText(''); });
  };
  const handleCCTVAnalysis = () => {
    setCctvAlert(null);
    handleAPI('cctv/analyze', { camera_id: "Cam-04-Concourse" }, (d) => setCctvAlert(d.alert || "Vision processing failed."), setCctvLoading);
  };
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!input.trim() || chatLoading) return;
    const userMessage = input;
    setInput(''); setMessages(p => [...p, { role: 'user', content: userMessage }]);
    handleAPI('chat', { message: userMessage, language: fanLang, user_location: location }, (d) => {
      setMessages(p => [...p, { role: 'assistant', content: d.reply || "Error." }]);
    }, setChatLoading);
  };
  const handleGetRoute = () => handleAPI('route', { start: location, destination: destination, language: fanLang }, (d) => setRouteAdvice(d.route_advice || "Error calculating route."), setRouteLoading);
  const handleOracleQuery = (e) => { e.preventDefault(); if (oracleInput) handleAPI('oracle', { query: oracleInput }, (d) => setOracleAnswer(d.answer || "Error connecting to Vector DB."), setOracleLoading); };

  const renderHeatmap = useMemo(() => {
    const getHeatmapStyle = (density) => {
      if (density >= 85) return { bg: 'bg-rose-500/10', border: 'border-rose-500/50', text: 'text-rose-400', bar: 'bg-rose-500', shadow: 'shadow-[0_0_15px_rgba(244,63,94,0.2)]' };
      if (density >= 60) return { bg: 'bg-amber-500/10', border: 'border-amber-500/50', text: 'text-amber-400', bar: 'bg-amber-500', shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]' };
      return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/50', text: 'text-emerald-400', bar: 'bg-emerald-500', shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.1)]' };
    };

    return (
      <div aria-live="polite" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {dashboardData?.zones?.map((zone) => {
          const style = getHeatmapStyle(zone.density);
          return (
            <div key={zone.id} className={`p-4 rounded-2xl border backdrop-blur-sm transition-all duration-700 ${style.bg} ${style.border} ${style.shadow}`}>
              <div className="flex justify-between items-end mb-3">
                <span className="font-bold text-sm text-slate-200 tracking-wide">{zone.name}</span>
                <span className={`text-xl font-black font-mono ${style.text}`}>{zone.density}%</span>
              </div>
              {/* Sci-Fi Progress Bar */}
              <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                <div className={`h-full ${style.bar} transition-all duration-1000 ease-out rounded-full`} style={{ width: `${zone.density}%` }}></div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [dashboardData]);

  return (
    // Unique Dark Mesh Gradient Background
    <div className="flex flex-col h-screen bg-[#0B0F19] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.15),rgba(255,255,255,0))] text-slate-100 font-sans overflow-hidden">
      
      {/* Glassmorphic Header */}
      <header role="banner" className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]">
            <Fingerprint size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">STADIUM<span className="text-cyan-400">OPS</span>.AI</h1>
          </div>
        </div>
        <nav aria-label="Main Navigation" className="flex p-1 rounded-full bg-black/40 border border-white/10 backdrop-blur-md">
          <button aria-pressed={currentView === 'fan'} onClick={() => setCurrentView('fan')} className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all cursor-pointer ${currentView === 'fan' ? 'bg-white/10 text-cyan-400 shadow-lg' : 'text-slate-500 hover:text-white'}`}><User size={16} aria-hidden="true"/> Fan Portal</button>
          <button aria-pressed={currentView === 'ops'} onClick={() => setCurrentView('ops')} className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all cursor-pointer ${currentView === 'ops' ? 'bg-white/10 text-indigo-400 shadow-lg' : 'text-slate-500 hover:text-white'}`}><LayoutDashboard size={16} aria-hidden="true"/> Command Center</button>
        </nav>
      </header>

      {/* Cyberpunk Emergency Banner */}
      {activeAnnouncement && (
        <div role="alert" aria-live="assertive" aria-atomic="true" className={`w-full py-3 px-6 flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-40 border-b ${activeAnnouncement.severity === 'critical' ? 'bg-rose-600/90 border-rose-400 text-white animate-pulse' : 'bg-amber-500/90 border-amber-300 text-black'}`}>
          <div className="flex items-center gap-3 font-black tracking-widest text-sm uppercase">
            <AlertTriangle size={18} aria-hidden="true" /><span>{activeAnnouncement.severity} OVERRIDE: {activeAnnouncement.message}</span>
          </div>
          <button aria-label="Listen to Alert" onClick={() => playAudio(activeAnnouncement.message, 'English')} className="p-2 bg-black/20 hover:bg-black/40 rounded-full transition-colors cursor-pointer backdrop-blur-sm"><Volume2 size={16} aria-hidden="true"/></button>
        </div>
      )}

      {currentView === 'fan' ? (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Fan Background Accent */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

          <section aria-label="Crowd Management Router" className="px-6 py-5 border-b border-white/5 bg-white/[0.02] backdrop-blur-md z-10">
            <div className="max-w-4xl mx-auto">
              <h3 className="text-xs font-black text-cyan-500 mb-3 flex items-center gap-2 tracking-widest uppercase"><Map size={14} aria-hidden="true"/> Neural Navigation</h3>
              <div className="flex flex-wrap gap-3 items-center">
                <select aria-label="Starting Location" value={location} onChange={(e) => setLocation(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 flex-1 cursor-pointer focus:border-cyan-500 focus:outline-none"><option value="Gate 1">Gate 1</option><option value="Gate 2">Gate 2</option><option value="Gate 3">Gate 3</option></select>
                <ChevronRight size={16} className="text-slate-600" />
                <select aria-label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 flex-1 cursor-pointer focus:border-cyan-500 focus:outline-none"><option value="Section 204">Section 204</option><option value="Gate 4">Gate 4</option><option value="Food Court B">Food Court B</option></select>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 flex-1 focus-within:border-cyan-500"><Globe size={16} className="text-cyan-500" aria-hidden="true" /><select aria-label="Language Selection" value={fanLang} onChange={(e) => setFanLang(e.target.value)} className="bg-transparent text-sm text-slate-200 focus:outline-none w-full cursor-pointer">{SUPPORTED_LANGUAGES.map(l => <option key={l.name} value={l.name} className="bg-slate-900">{l.name}</option>)}</select></div>
                <button onClick={handleGetRoute} disabled={routeLoading} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all">{routeLoading ? 'Calculating...' : 'Generate Path'}</button>
              </div>
              {routeAdvice && (
                <div aria-live="polite" className="mt-4 p-4 bg-cyan-950/30 border border-cyan-500/30 rounded-xl text-cyan-100 text-sm flex justify-between items-start gap-4 shadow-inner backdrop-blur-md">
                  <p className="leading-relaxed">{routeAdvice}</p><button aria-label="Listen to Route" onClick={() => playAudio(routeAdvice, fanLang)} className="text-cyan-400 mt-0.5 cursor-pointer hover:text-white"><Volume2 size={18} aria-hidden="true" /></button>
                </div>
              )}
            </div>
          </section>

          <main aria-label="AI Chat Concierge" aria-live="polite" className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full z-10 scrollbar-hide">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-4 rounded-3xl whitespace-pre-wrap flex flex-col gap-2 shadow-lg backdrop-blur-md ${msg.role === 'user' ? 'bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-br-sm border border-blue-400/50' : 'bg-white/5 text-slate-200 rounded-bl-sm border border-white/10'}`}>
                  <span className="leading-relaxed text-sm">{msg.content}</span>
                  {msg.role === 'assistant' && <button aria-label="Listen to Message" onClick={() => playAudio(msg.content, fanLang)} className="self-end text-slate-400 hover:text-cyan-400 mt-1 cursor-pointer"><Volume2 size={16} aria-hidden="true" /></button>}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 p-4 rounded-3xl rounded-bl-sm flex items-center gap-2 shadow-lg backdrop-blur-md">
                  <span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"></span><span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.2s]"></span><span className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </main>

          <footer className="p-6 border-t border-white/5 bg-black/20 backdrop-blur-xl z-10">
            <form onSubmit={handleSendChat} className="max-w-4xl mx-auto flex gap-3 relative">
              <input aria-label="Chat Input" type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Communicate with Concierge...`} className="flex-1 bg-black/50 border border-white/10 rounded-full pl-6 pr-14 py-4 text-sm text-white focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all" />
              <button aria-label="Send Message" type="submit" disabled={chatLoading || !input.trim()} className="absolute right-2 top-2 bottom-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white w-10 h-10 flex items-center justify-center rounded-full cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all"><Send size={16} aria-hidden="true" className="ml-1" /></button>
            </form>
          </footer>
        </div>
      ) : (
        <main aria-label="Operational Intelligence Dashboard" className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6 relative z-10">
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* LEFT COLUMN */}
            <div className="xl:col-span-2 space-y-6">
              
              {/* Telemetry Matrix (Glassmorphism) */}
              <section aria-label="Density Heatmap" className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="flex items-center justify-between mb-6 relative z-10">
                  <h2 className="text-sm font-black text-indigo-400 tracking-widest uppercase flex items-center gap-2"><Activity size={16} aria-hidden="true"/> Live Telemetry Array</h2>
                  <div role="group" aria-label="Time Forecast Controls" className="flex bg-black/40 rounded-full p-1 border border-white/10">
                    <button aria-pressed={forecastTime === 0} onClick={() => setForecastTime(0)} className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${forecastTime === 0 ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'text-slate-500 hover:text-white'}`}>LIVE</button>
                    <button aria-pressed={forecastTime === 15} onClick={() => setForecastTime(15)} className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${forecastTime === 15 ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'text-slate-500 hover:text-white'}`}>+15m PRED</button>
                  </div>
                </div>
                {renderHeatmap}
              </section>

              {/* CCTV Interface (Sci-Fi Scanlines) */}
              <section aria-label="CCTV Vision AI Panel" className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                 <div className="flex items-center justify-between mb-5">
                   <div className="flex items-center gap-2 text-rose-400">
                    <Camera size={16} aria-hidden="true" />
                    <h2 className="text-sm font-black uppercase tracking-widest">Neural Vision Feed</h2>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-6 mb-2">
                  <div className="sm:w-2/5 aspect-video bg-black rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden group">
                    {/* Fake Camera Feed Background */}
                    <div className="absolute inset-0 opacity-30 bg-[url('https://images.unsplash.com/photo-1556056504-5c7696c4c28d?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center mix-blend-luminosity grayscale"></div>
                    {/* Sci-Fi Grid Overlay */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none"></div>
                    
                    {/* Animated Active Scanline */}
                    {cctvLoading && <div className="absolute top-0 left-0 w-full h-1 bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,1)] animate-[bounce_1.5s_infinite] opacity-70 z-20"></div>}
                    
                    <span className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-mono text-rose-500 font-bold bg-black/60 px-2 py-0.5 rounded border border-rose-500/30 backdrop-blur-md z-10"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span> REC</span>
                    <span className="absolute bottom-3 right-3 text-[10px] font-mono text-white/50 z-10 tracking-widest">CAM-04/SOUTH</span>
                  </div>

                  <div className="flex-1 flex flex-col justify-center gap-4">
                    <p className="text-xs text-slate-400 leading-relaxed font-mono">Vision agents process feed data to detect crowding, security breaches, and hazards. Flagged anomalies are written directly to secure operational logs.</p>
                    <button aria-label="Analyze Active Camera Feed" onClick={handleCCTVAnalysis} disabled={cctvLoading} className="w-fit bg-rose-600/20 border border-rose-500 hover:bg-rose-600 hover:shadow-[0_0_15px_rgba(244,63,94,0.4)] disabled:opacity-50 text-rose-100 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer flex gap-2 items-center transition-all">
                      {cctvLoading ? <RefreshCw size={14} className="animate-spin text-rose-400" aria-hidden="true"/> : <Search size={14} className="text-rose-400" aria-hidden="true"/>}
                      {cctvLoading ? 'Running Inference...' : 'Engage Vision AI'}
                    </button>
                  </div>
                </div>
                
                {/* Audit Log Terminal */}
                {incidentLog.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-white/5">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Database size={12} aria-hidden="true"/> Secure Event Ledger</h3>
                    <div aria-live="polite" className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide pr-2">
                      {incidentLog.map(incident => (
                        <div key={incident.id} className="p-3 bg-black/40 rounded-lg border border-white/5 text-xs text-slate-300 flex flex-col gap-1.5 hover:border-white/10 transition-colors">
                           <div className="flex justify-between text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                             <span>ID_REF: {incident.id} // LOC: {incident.zone_id}</span>
                             <span className="text-rose-400 border border-rose-400/30 px-1.5 rounded">{incident.status}</span>
                           </div>
                           <p className="font-mono text-slate-400 leading-relaxed">{incident.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-6">
              
              {/* RAG Oracle (Terminal Interface) */}
              <section aria-label="Real-time Decision Support Oracle" className="bg-[#0A1929] p-6 rounded-3xl border border-[#1E3A8A] shadow-[0_0_30px_rgba(30,58,138,0.15)] relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-600"></div>
                 <div className="flex items-center gap-2 text-cyan-400 mb-5">
                  <BookOpen size={16} aria-hidden="true" />
                  <h2 className="text-sm font-black uppercase tracking-widest">Protocol Oracle</h2>
                </div>
                <form onSubmit={handleOracleQuery} className="flex flex-col gap-3 mb-2">
                  <div className="relative w-full">
                    <span className="absolute left-3 top-3.5 text-cyan-500 font-mono text-sm font-bold">&gt;</span>
                    <input aria-label="Search Operating Procedures" type="text" value={oracleInput} onChange={(e) => setOracleInput(e.target.value)} placeholder="Query vector space..." className="w-full bg-black/50 border border-cyan-900 rounded-lg pl-8 pr-4 py-3 text-xs font-mono text-cyan-100 focus:outline-none focus:border-cyan-500 transition-colors" />
                  </div>
                  <button type="submit" disabled={oracleLoading || !oracleInput} className="w-full bg-cyan-900/40 border border-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-cyan-100 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors">
                    {oracleLoading ? 'Searching Vectors...' : 'Execute Query'}
                  </button>
                </form>
                {oracleAnswer && <div aria-live="polite" className="mt-4 p-4 bg-black/60 border-l-2 border-cyan-500 rounded-r-lg text-xs text-cyan-300 font-mono whitespace-pre-wrap leading-loose">{oracleAnswer}</div>}
              </section>

              {/* Broadcast Studio */}
              <section aria-label="Translation Studio" className="bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl">
                <div className="flex items-center gap-2 text-amber-400 mb-5">
                  <Megaphone size={16} aria-hidden="true" /><h2 className="text-sm font-black uppercase tracking-widest">Global Override</h2>
                </div>
                <div className="space-y-4">
                  <textarea aria-label="Broadcast Message Input" value={draftMsg} onChange={(e) => setDraftMsg(e.target.value)} placeholder="Draft emergency transmission..." className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xs text-white focus:outline-none focus:border-amber-500 resize-none" rows="3" />
                  <div className="flex gap-2">
                    <select aria-label="Target Language" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 flex-1 cursor-pointer focus:outline-none focus:border-amber-500">
                      {SUPPORTED_LANGUAGES.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                    </select>
                    <button onClick={handleTranslate} disabled={isTranslating || !draftMsg} className="bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 cursor-pointer text-xs font-bold uppercase tracking-wider transition-all">{isTranslating ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : 'Translate'}</button>
                  </div>
                  {translatedText && <div aria-live="polite" className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-100 text-xs leading-relaxed">{translatedText}</div>}
                  <button onClick={handleBroadcast} disabled={!draftMsg && !translatedText} className="w-full bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-50 text-white font-black uppercase tracking-widest py-3 rounded-xl cursor-pointer text-xs shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all flex justify-center items-center gap-2">Transmit Push Alert</button>
                </div>
              </section>

              {/* AI Briefing */}
              <section aria-label="Operational Intelligence Briefing" className="bg-indigo-950/40 backdrop-blur-xl p-6 rounded-3xl border border-indigo-500/30 shadow-2xl">
                <div className="flex items-center justify-between mb-4 border-b border-indigo-500/20 pb-3">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Activity size={16} aria-hidden="true" />
                    <h2 className="text-[10px] font-black uppercase tracking-widest">{forecastTime === 0 ? 'Live Synthesis' : 'Predictive Synthesis'}</h2>
                  </div>
                  {dashLoading && <RefreshCw size={14} className="text-indigo-400 animate-spin" aria-label="Loading..." />}
                </div>
                <div aria-live="polite" className="text-xs text-indigo-100/80 whitespace-pre-wrap leading-relaxed font-mono">{dashboardData?.ai_briefing || "Awaiting telemetry..."}</div>
              </section>

            </div>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;